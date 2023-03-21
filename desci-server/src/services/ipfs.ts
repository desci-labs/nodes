import { CodeComponent, PdfComponent, ResearchObjectComponentType, ResearchObjectV1 } from '@desci-labs/desci-models';
import { PBNode } from '@ipld/dag-pb/src/interface';
import { DataReference, DataType, NodeVersion } from '@prisma/client';
import axios from 'axios';
import CID from 'cids';
import * as ipfs from 'ipfs-http-client';
import { CID as CID2 } from 'ipfs-http-client';
import toBuffer from 'it-to-buffer';
import flatten from 'lodash/flatten';
import uniq from 'lodash/uniq';
import * as multiformats from 'multiformats';

import prisma from 'client';
import { getGithubExternalUrl, processGithubUrl } from 'utils/githubUtils';
import { createManifest, getUrlsFromParam, makePublic } from 'utils/manifestDraftUtils';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { addToDir, concat, getSize } = require('../utils/dagConcat.cjs');

// !!NOTE: this will point to your local, ephemeral nebulus IPFS store
// in staging / prod, it will need to point to the appropriate IPFS gateway, which is either private or public
// export const PUBLIC_IPFS_PATH =
//   process.env.NODE_ENV === 'dev' || process.env.NODE_ENV === 'test'
//     ? `http://host.docker.internal:8089/ipfs`
//     : 'https://ipfs.desci.com/ipfs';

export const IPFS_PATH_TMP = '/tmp/ipfs';

// key = type
// data = array of string URLs
// returns array of corrected URLs
export interface UrlWithCid {
  cid: string;
  key: string;
  buffer?: Buffer;
  size?: number;
}

// connect to a different API
export const client = ipfs.create({ url: process.env.IPFS_NODE_URL });

export const updateManifestAndAddToIpfs = async (
  manifest: ResearchObjectV1,
  { userId, nodeId }: { userId: number; nodeId: number },
): Promise<{ cid: string; size: number; ref: DataReference; nodeVersion: NodeVersion }> => {
  const result = await addBufferToIpfs(createManifest(manifest), '');
  const version = await prisma.nodeVersion.create({
    data: {
      manifestUrl: result.cid,
      nodeId: nodeId,
    },
  });
  console.log('[NodeVersion]', version);
  const ref = await prisma.dataReference.create({
    data: {
      cid: result.cid.toString(),
      size: result.size,
      root: false,
      type: DataType.MANIFEST,
      userId,
      nodeId,
      // versionId: version.id,
      directory: false,
    },
  });
  console.log('[dataReference Created]', ref);

  return { cid: result.cid.toString(), size: result.size, ref, nodeVersion: version };
};

export const addBufferToIpfs = (buf: Buffer, key: string) => {
  return client.add(buf, { cidVersion: 1 }).then((res) => {
    return { cid: res.cid.toString(), size: res.size, key };
  });
};

export const downloadFilesAndMakeManifest = async ({ title, defaultLicense, pdf, code, researchFields }) => {
  const pdfHashes = pdf ? await Promise.all(processUrls('pdf', getUrlsFromParam(pdf))) : [];
  const codeHashes = code ? await Promise.all(processUrls('code', getUrlsFromParam(code))) : [];
  const files = (await Promise.all([pdfHashes, codeHashes].flat())).flat();
  console.log('downloadFilesAndMakeManifest', files);

  // make manifest

  const researchObject: ResearchObjectV1 = {
    version: 1,
    components: [],
    contributors: [],
  };

  const pdfComponents = (await pdfHashes).map((d: UrlWithCid) => {
    const objectComponent: PdfComponent = {
      id: d.cid,
      name: 'Research Report',
      type: ResearchObjectComponentType.PDF,
      payload: {
        url: makePublic([d])[0].val,
        annotations: [],
      },
    };
    return objectComponent;
  });
  const codeComponents = (await codeHashes).map((d: UrlWithCid) => {
    const objectComponent: CodeComponent = {
      id: d.cid,
      name: 'Code',
      type: ResearchObjectComponentType.CODE,
      payload: {
        language: 'bash',
        code: makePublic([d])[0].val,
      },
    };
    return objectComponent;
  });
  researchObject.title = title;
  researchObject.defaultLicense = defaultLicense;
  researchObject.researchFields = researchFields;
  researchObject.components = researchObject.components.concat(pdfComponents, codeComponents);

  console.log('RESEARCH OBJCECT', JSON.stringify(researchObject));

  const manifest = createManifest(researchObject);

  return { files, pdfHashes, codeHashes, manifest, researchObject };
};

interface PdfComponentSingle {
  component: PdfComponent;
  file: UrlWithCid;
}
interface CodeComponentSingle {
  component: CodeComponent;
  file: UrlWithCid;
}

const processUrls = (key: string, data: Array<string>): Array<Promise<UrlWithCid>> => {
  console.log('processUrls', key, data);

  return data.map(async (e, i) => {
    // if our payload points to github, download a zip of the main branch
    if (key === 'code') {
      if (e.indexOf('github.com') > -1) {
        const { branch, author, repo } = await processGithubUrl(e);

        const newUrl = `https://github.com/${author}/${repo}/archive/refs/heads/${branch}.zip`;
        console.log('NEW URL', newUrl);
        e = newUrl;
      }
    }
    return downloadFile(e, key);
  });
};

export const downloadFile = async (url: string, key: string): Promise<UrlWithCid> => {
  console.log('createDraft::downloadFile', url.substring(0, 256), key);

  if (url.indexOf('data:') === 0) {
    const buf = Buffer.from(url.split(',')[1], 'base64');
    return addBufferToIpfs(buf, key);
  }

  return new Promise(async (resolve, reject) => {
    try {
      console.log('start download', url.substring(0, 256));
      const { data, headers } = await axios({
        method: 'get',
        url: url,
        responseType: 'stream',
        // cancelToken: source.token,
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/101.0.4951.41 Safari/537.36',
        },
      });
      console.log('finish download', url.substring(0, 256));

      resolve(addBufferToIpfs(data, key));
    } catch (err) {
      console.error('got error', err);
      console.log('try with playwright', url.substring(0, 256));
    }
  });
};

export const downloadSingleFile = async (url: string): Promise<PdfComponentSingle | CodeComponentSingle> => {
  if (url.indexOf('github.com') > -1) {
    const file = await processUrls('code', getUrlsFromParam([url]))[0];

    const component: CodeComponent = {
      id: file.cid,
      name: 'Code',
      type: ResearchObjectComponentType.CODE,
      payload: {
        url: makePublic([file])[0].val,
        externalUrl: await getGithubExternalUrl(url),
      },
    };

    return { component, file };
  }
  const file = await processUrls('pdf', getUrlsFromParam([url]))[0];

  const component: PdfComponent = {
    id: file.cid,
    name: 'Research Report',
    type: ResearchObjectComponentType.PDF,
    payload: {
      url: makePublic([file])[0].val,
      annotations: [],
    },
  };

  return { component, file };
};

export interface IpfsDirStructuredInput {
  path: string;
  content: Buffer;
}

export interface IpfsPinnedResult {
  path: string;
  cid: string;
  size: number;
}

export const pinDirectory = async (
  files: IpfsDirStructuredInput[],
  wrapWithDirectory = false,
): Promise<IpfsPinnedResult[]> => {
  const isOnline = await client.isOnline();
  console.log('isOnline', isOnline);

  //possibly check if uploaded with a root dir, omit the wrapping if there is a root dir
  const uploaded: IpfsPinnedResult[] = [];
  for await (const file of client.addAll(files, { wrapWithDirectory: wrapWithDirectory, cidVersion: 1 })) {
    uploaded.push({ path: file.path, cid: file.cid.toString(), size: file.size });
  }

  return uploaded;
};

export interface RecursiveLsResult extends IpfsPinnedResult {
  name: string;
  contains?: RecursiveLsResult[];
  type: 'dir' | 'file';
  parent?: RecursiveLsResult;
}

export interface FileDir extends RecursiveLsResult {
  date?: string;
  published?: boolean;
}

const convertToCidV1 = (cid: string | CID): string => {
  if (typeof cid === 'string') {
    const c = new CID(cid, cid.substring(0, 1) === 'Q' ? 0 : 1);
    // console.log(`cid provided: ${cid} into ${c}`);
    return c.toV1().toString();
  } else {
    const cV1 = cid.toV1().toString();
    // console.log(`cid provided: ${cid} into ${cV1}`);
    return cV1;
  }
};

export const resolveIpfsData = async (cid: string): Promise<Buffer> => {
  try {
    console.log('[ipfs:resolveIpfsData] ipfs.cat cid=', cid);
    const iterable = await client.cat(cid);
    const dataArray = [];

    for await (const x of iterable) {
      dataArray.push(x);
    }

    return Buffer.from(dataArray);
  } catch (err) {
    // console.error('error', err.message);
    console.log('[ipfs:resolveIpfsData] ipfs.dag.get', cid);
    const res = await client.dag.get(multiformats.CID.parse(cid));

    return Buffer.from((res.value.Data as Uint8Array).buffer);
  }
};

export const convertToCidV0 = (cid: string) => {
  const c = new CID(cid, cid.substring(0, 1) === 'Q' ? 0 : 1);
  console.log('convertToCidV1', c.toV0());

  return c.toV0().toString();
};

export const getDirectoryTreeCids = async (cid: string): Promise<string[]> => {
  const tree = await getDirectoryTree(cid);
  const recurse = (arr: RecursiveLsResult[]) => {
    return arr.flatMap((e) => {
      if (e && e.contains) {
        return flatten([recurse(e.contains), e.parent, e.path.split('/')[0], e.cid]);
      } else {
        return e;
      }
    });
  };
  const flatCids = uniq(
    recurse(tree)
      .filter(Boolean)
      .map((e) => e.cid || e)
      .concat([cid]),
  );
  return flatCids;
};

export const getDirectoryTree = async (cid: string): Promise<RecursiveLsResult[]> => {
  const isOnline = await client.isOnline();
  console.log(`retrieving tree for cid: ${cid}, ipfs online: ${isOnline}`);

  const tree = await recursiveLs(cid);
  // debugger;
  return tree;
};

export const recursiveLs = async (cid: string, parent?: RecursiveLsResult, carryPath?: string) => {
  carryPath = carryPath || convertToCidV1(cid);
  const tree = [];
  for await (const filedir of client.ls(cid)) {
    const res: any = filedir;
    if (parent) {
      res.parent = parent;
      const pathSplit = res.path.split('/');
      pathSplit[0] = carryPath;
      res.path = pathSplit.join('/');
    }
    const v1StrCid = convertToCidV1(res.cid);

    if (filedir.type === 'file') tree.push({ ...res, cid: v1StrCid });
    if (filedir.type === 'dir') {
      res.cid = v1StrCid;
      res.contains = await recursiveLs(res.cid, { ...res, cid: v1StrCid }, carryPath + '/' + res.name);
      tree.push({ ...res, cid: v1StrCid });
    }
  }
  return tree;
};

export const getDag = async (cid: ipfs.CID) => {
  const dag = await client.dag.get(cid);
  return dag;
};

export const getDatasetTar = async (cid) => {
  const files = await client.get(cid, { archive: true });
  return files;
};

export const getDataset = async (cid) => {
  const files = [];
  for await (const file of client.get(cid)) {
    files.push(file);
  }

  return files;
};

export const getFilesAndPaths = async (tree: RecursiveLsResult) => {
  const filesAndPaths = [];
  const promises = tree.contains.map(async (fd) => {
    if (fd.type === 'file') {
      const buffer = Buffer.from(await toBuffer(client.cat(fd.cid)));
      filesAndPaths.push({ path: fd.path, content: buffer });
      // console.log('f&p here: ', filesAndPaths);
    }
    if (fd.type === 'dir') {
      filesAndPaths.push(await getFilesAndPaths(fd));
    }
  });
  // console.log('f&p mid: ', filesAndPaths);
  await Promise.all(promises);
  return filesAndPaths;
};

export const isDir = async (cid: string): Promise<boolean> => {
  try {
    const files = await client.ls(cid);

    for await (const file of files) {
      if (file.type === 'dir') {
        return true;
      }
    }
    return false;
  } catch (error) {
    console.error(`Failed checking if CID is dir: ${error}`);
    return false;
  }
};

type FilePath = string;
type FileInfo = { cid: string; size: number };
export type FilesToAddToDag = Record<FilePath, FileInfo>;

export const addFilesToDag = async (rootCid: string, contextPath: string, filesToAddToDag: FilesToAddToDag) => {
  const dagCidsToBeReset = [];
  //                  CID(String): DAGNode     - cached to prevent duplicate calls
  const dagsLoaded: Record<string, PBNode> = {};
  dagCidsToBeReset.push(CID2.parse(rootCid));
  const stagingDagNames = contextPath.split('/');

  if (contextPath.length) {
    for (let i = 0; i < stagingDagNames.length; i++) {
      const dagLinkName = stagingDagNames[i];
      const containingDagCid = dagCidsToBeReset[i];
      //FIXME containingDag is of type PBNode
      const containingDag: any = await client.object.get(containingDagCid);
      if (!containingDag) {
        throw Error('Failed updating dataset, existing DAG not found');
      }
      dagsLoaded[containingDagCid.toString()] = containingDag;
      const matchingLink = containingDag.Links.find((linkNode) => linkNode.Name === dagLinkName);
      if (!matchingLink) {
        throw Error('Failed updating dataset, existing DAG link not found');
      }
      dagCidsToBeReset.push(matchingLink.Hash);
    }
  }

  //if context path doesn't exist(update add at DAG root level), the dag won't be cached yet.
  if (!dagsLoaded.length) {
    //FIXME rootDag is of type PBNode
    const rootDag = await client.object.get(dagCidsToBeReset[0]);
    dagsLoaded[rootCid] = rootDag;
  }

  //establishing the tail dag that's being updated
  const tailNodeCid = dagCidsToBeReset.pop();
  const tailNode = dagsLoaded[tailNodeCid.toString()]
    ? dagsLoaded[tailNodeCid.toString()]
    : await client.object.get(tailNodeCid);

  const updatedTailNodeCid = await addToDir(client, tailNodeCid.toString(), filesToAddToDag);
  // oldToNewCidMap[tailNodeCid.toString()] = updatedTailNodeCid.toString();
  const treehere = await getDirectoryTree(updatedTailNodeCid);

  let lastUpdatedCid = updatedTailNodeCid;
  while (dagCidsToBeReset.length) {
    const currentNodeCid = dagCidsToBeReset.pop();
    //FIXME should be PBLink
    const currentNode: any = dagsLoaded[currentNodeCid.toString()]
      ? dagsLoaded[currentNodeCid.toString()]
      : await client.object.get(currentNodeCid);
    const linkName = stagingDagNames.pop();
    const dagIdx = currentNode.Links.findIndex((dag) => dag.Name === linkName);
    if (dagIdx === -1) throw Error(`Failed to find DAG link: ${linkName}`);
    // const oldCid = currentNode.Links[dagIdx].Hash.toString();
    const oldLinkRemovedCid = await client.object.patch.rmLink(currentNodeCid, currentNode.Links[dagIdx]);
    lastUpdatedCid = await addToDir(client, oldLinkRemovedCid, { [linkName]: { cid: lastUpdatedCid } });
    // oldToNewCidMap[oldCid] = lastUpdatedCid.toString();
  }

  return lastUpdatedCid.toString();
};
