import {
  CodeComponent,
  PdfComponent,
  ResearchObjectComponentType,
  ResearchObjectV1,
  ResearchObjectV1Component,
} from '@desci-labs/desci-models';
import * as dagPb from '@ipld/dag-pb';
import { PBNode } from '@ipld/dag-pb/src/interface';
import { DataReference, DataType, NodeVersion, Prisma } from '@prisma/client';
import axios from 'axios';
// import CID from 'cids';
import * as ipfs from 'ipfs-http-client';
import { CID as CID2 } from 'ipfs-http-client';
import UnixFS from 'ipfs-unixfs';
import toBuffer from 'it-to-buffer';
import flatten from 'lodash/flatten';
import uniq from 'lodash/uniq';
import * as multiformats from 'multiformats';
import { code as rawCode } from 'multiformats/codecs/raw';
import * as yauzl from 'yauzl';

import prisma from 'client';
import { PUBLIC_IPFS_PATH } from 'config';
import { getOrCache } from 'redisClient';
import { DRIVE_NODE_ROOT_PATH, ExternalCidMap, newCid, oldCid } from 'utils/driveUtils';
import { deneutralizePath } from 'utils/driveUtils';
import { getGithubExternalUrl, processGithubUrl } from 'utils/githubUtils';
import { createManifest, getUrlsFromParam, makePublic } from 'utils/manifestDraftUtils';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { addToDir, concat, getSize, makeDir, updateDagCid } = require('../utils/dagConcat.cjs');
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
export const readerClient = ipfs.create({ url: PUBLIC_IPFS_PATH });
export const publicIpfs = ipfs.create({ url: process.env.PUBLIC_IPFS_RESOLVER });

// Timeouts for resolution on internal and external IPFS nodes, to prevent server hanging, in ms.
const INTERNAL_IPFS_TIMEOUT = 5000;
const EXTERNAL_IPFS_TIMEOUT = 15000;

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
  console.log(`[ipfs::updateManifestAndAddToIpfs] manifestCid=${result.cid} nodeVersion=${version}`);
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

export const getSizeForCid = async (cid: string, asDirectory: boolean | undefined): Promise<number> => {
  const size = await getSize(client, cid, asDirectory);
  return size;
};

export const downloadFilesAndMakeManifest = async ({ title, defaultLicense, pdf, code, researchFields }) => {
  const pdfHashes = pdf ? await Promise.all(processUrls('pdf', getUrlsFromParam(pdf))) : [];
  const codeHashes = code ? await Promise.all(processUrls('code', getUrlsFromParam(code))) : [];
  const files = (await Promise.all([pdfHashes, codeHashes].flat())).flat();
  console.log('downloadFilesAndMakeManifest', files);

  // make manifest

  const researchObject: ResearchObjectV1 = {
    version: 'desci-nodes-0.2.0',
    components: [],
    authors: [],
  };

  const emptyDagCid = await createEmptyDag();

  const dataBucketComponent: ResearchObjectV1Component = {
    id: 'root',
    name: 'root',
    type: ResearchObjectComponentType.DATA_BUCKET,
    payload: {
      cid: emptyDagCid,
      path: DRIVE_NODE_ROOT_PATH,
    },
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
  researchObject.components = researchObject.components.concat(dataBucketComponent, pdfComponents, codeComponents);

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
  const addAll = await client.addAll(files, { wrapWithDirectory: wrapWithDirectory, cidVersion: 1 });
  for await (const file of addAll) {
    uploaded.push({ path: file.path, cid: file.cid.toString(), size: file.size });
  }
  return uploaded;
};

export async function pinExternalDags(cids: string[]) {
  const result = [];
  for await (const cid of cids) {
    const cidType = multiformats.CID.parse(cid);
    const block = await publicIpfs.block.get(cidType);
    const res = await client.block.put(block);
    result.push(res);
  }
  return result;
}

export interface RecursiveLsResult extends IpfsPinnedResult {
  name: string;
  contains?: RecursiveLsResult[];
  type: 'dir' | 'file';
  parent?: RecursiveLsResult;
  external?: boolean;
}

export interface FileDir extends RecursiveLsResult {
  date?: string;
  published?: boolean;
}

export const convertToCidV1 = (cid: string | multiformats.CID): string => {
  if (typeof cid === 'string') {
    const c = multiformats.CID.parse(cid);
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
    console.log('[ipfs:resolveIpfsData] START ipfs.cat cid=', cid);
    const iterable = await readerClient.cat(cid);
    console.log('[ipfs:resolveIpfsData] SUCCESS(1/2) ipfs.cat cid=', cid);
    const dataArray = [];

    for await (const x of iterable) {
      dataArray.push(x);
    }
    console.log(`[ipfs:resolveIpfsData] SUCCESS(2/2) ipfs.cat cid=${cid}, len=${dataArray.length}`);

    return Buffer.from(dataArray);
  } catch (err) {
    // console.error('error', err.message);
    // console.error('[ipfs:resolveIpfsData] ERROR ipfs.dag.get', cid);
    const res = await client.dag.get(multiformats.CID.parse(cid));
    let targetValue = res.value.Data;
    if (!targetValue) {
      targetValue = res.value;
    }
    console.error(`[ipfs:resolveIpfsData] SUCCESS(2/2) DAG, ipfs.dag.get cid=${cid}, bufferLen=${targetValue.length}`);
    const uint8ArrayTarget = targetValue as Uint8Array;
    if (uint8ArrayTarget.buffer) {
      targetValue = (targetValue as Uint8Array).buffer;
    }

    const buffer = Buffer.from(targetValue);
    return buffer;
  }
};

export const convertToCidV0 = (cid: string) => {
  const c = multiformats.CID.parse(cid);
  const v0 = c.toV0();
  console.log('convertToCidV1', v0);

  return v0.toString();
};

export const getDirectoryTreeCids = async (cid: string, externalCidMap: ExternalCidMap): Promise<string[]> => {
  const tree = await getDirectoryTree(cid, externalCidMap);
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

export const nodeKeepFile = '.nodeKeep';

export const getDirectoryTree = async (cid: string, externalCidMap: ExternalCidMap): Promise<RecursiveLsResult[]> => {
  const isOnline = await client.isOnline();
  console.log(`[getDirectoryTree]retrieving tree for cid: ${cid}, ipfs online: ${isOnline}`);
  try {
    debugger;
    const tree = await getOrCache(`tree-${cid}`, getTree);
    if (tree) return tree;
    throw new Error('[getDirectoryTree] Failed to retrieve tree from cache');
  } catch (err) {
    console.log('[getDirectoryTree] error', err);
    console.log('[getDirectoryTree] Falling back on uncached tree retrieval');
    return getTree();
  }
  async function getTree() {
    if (Object.keys(externalCidMap).length === 0) {
      console.log('[getDirectoryTree] using standard ls, dagCid: , cid');
      return await recursiveLs(cid);
    } else {
      console.log('[getDirectoryTree] using mixed ls, dagCid: , cid');
      const tree = await mixedLs(cid, externalCidMap);
      return tree;
    }
  }
};

export const recursiveLs = async (cid: string, carryPath?: string) => {
  carryPath = carryPath || convertToCidV1(cid);
  const tree = [];
  const lsOp = client.ls(cid);
  const promises = [];

  for await (const filedir of lsOp) {
    const promise = new Promise<void>(async (resolve, reject) => {
      const res: any = filedir;
      // if (parent) {
      //   res.parent = parent;
      const pathSplit = res.path.split('/');
      pathSplit[0] = carryPath;
      res.path = pathSplit.join('/');
      // }
      const v1StrCid = convertToCidV1(res.cid);
      if (filedir.type === 'file') tree.push({ ...res, cid: v1StrCid });
      if (filedir.type === 'dir') {
        res.cid = v1StrCid;
        res.contains = await recursiveLs(res.cid, carryPath + '/' + res.name);
        tree.push({ ...res, cid: v1StrCid });
      }
      resolve();
    });
    promises.push(promise);
  }
  await Promise.allSettled(promises);
  return tree;
};

//Used for recursively lsing a DAG containing both public and private cids
export async function mixedLs(dagCid: string, externalCidMap: ExternalCidMap, carryPath?: string) {
  carryPath = carryPath || convertToCidV1(dagCid);
  const tree = [];
  const cidObject = multiformats.CID.parse(dagCid);
  const block = await client.block.get(cidObject, { timeout: INTERNAL_IPFS_TIMEOUT });
  const { Data, Links } = dagPb.decode(block);
  const unixFs = UnixFS.unmarshal(Data);
  const isDir = dirTypes.includes(unixFs?.type);
  if (!isDir) return null;
  const promises = [];
  for (const link of Links) {
    const promise = new Promise<void>(async (resolve, reject) => {
      const result: RecursiveLsResult = {
        name: link.Name,
        path: carryPath + '/' + link.Name,
        cid: convertToCidV1(link.Hash.toString()),
        size: 0,
        type: 'file',
      };
      const externalCidMapEntry = externalCidMap[result.cid];
      if (externalCidMapEntry) result.external = true;
      const isExternalFile = externalCidMapEntry && externalCidMapEntry.directory == false;
      const linkCidObject = multiformats.CID.parse(result.cid);
      if (linkCidObject.code === rawCode || isExternalFile) {
        result.size = link.Tsize;
      } else {
        const linkBlock = await client.block.get(linkCidObject);
        const { Data: linkData } = dagPb.decode(linkBlock);
        const unixFsLink = UnixFS.unmarshal(linkData);
        const isLinkDir = dirTypes.includes(unixFsLink?.type);

        if (isLinkDir) {
          result.size = 0;
          result.type = 'dir';
          result.contains = (await mixedLs(
            result.cid,
            externalCidMap,
            carryPath + '/' + result.name,
          )) as RecursiveLsResult[];
        } else {
          result.size = link.Tsize;
        }
      }
      tree.push(result);
      resolve();
    });
    promises.push(promise);
  }
  await Promise.allSettled(promises);
  return tree;
}

export const pubRecursiveLs = async (cid: string, carryPath?: string) => {
  carryPath = carryPath || convertToCidV1(cid);
  const tree = [];
  const lsOp = await publicIpfs.ls(cid);
  for await (const filedir of lsOp) {
    // debugger;
    const res: any = filedir;
    // if (parent) {
    //   res.parent = parent;
    const pathSplit = res.path.split('/');
    pathSplit[0] = carryPath;
    res.path = pathSplit.join('/');
    // }
    const v1StrCid = convertToCidV1(res.cid);
    if (filedir.type === 'file') tree.push({ ...res, cid: v1StrCid });
    if (filedir.type === 'dir') {
      res.cid = v1StrCid;
      res.contains = await pubRecursiveLs(res.cid, carryPath + '/' + res.name);
      tree.push({ ...res, cid: v1StrCid });
    }
  }
  return tree;
};

// Used for recursively lsing a DAG without knowing if it contains public or private cids, slow and INEFFICIENT!
export async function discoveryLs(dagCid: string, externalCidMap: ExternalCidMap, carryPath?: string) {
  try {
    carryPath = carryPath || convertToCidV1(dagCid);
    const tree = [];
    const cidObject = multiformats.CID.parse(dagCid);
    let block = await client.block.get(cidObject, { timeout: INTERNAL_IPFS_TIMEOUT });
    if (!block) block = await publicIpfs.block.get(cidObject, { timeout: INTERNAL_IPFS_TIMEOUT });
    if (!block) throw new Error('Could not find block for cid: ' + dagCid);
    const { Data, Links } = dagPb.decode(block);
    const unixFs = UnixFS.unmarshal(Data);
    const isDir = dirTypes.includes(unixFs?.type);
    if (!isDir) return null;
    for (const link of Links) {
      const result: RecursiveLsResult = {
        name: link.Name,
        path: carryPath + '/' + link.Name,
        cid: convertToCidV1(link.Hash.toString()),
        size: 0,
        type: 'file',
      };
      const externalCidMapEntry = externalCidMap[result.cid];
      if (externalCidMapEntry) result.external = true;
      const isExternalFile = externalCidMapEntry && externalCidMapEntry.directory == false;
      const linkCidObject = multiformats.CID.parse(result.cid);
      if (linkCidObject.code === rawCode || isExternalFile) {
        result.size = link.Tsize;
      } else {
        let linkBlock = await client.block.get(linkCidObject, { timeout: INTERNAL_IPFS_TIMEOUT });
        if (!linkBlock) linkBlock = await publicIpfs.block.get(cidObject, { timeout: INTERNAL_IPFS_TIMEOUT });
        if (!linkBlock) throw new Error('Could not find block for cid: ' + dagCid);
        const { Data: linkData } = dagPb.decode(linkBlock);
        const unixFsLink = UnixFS.unmarshal(linkData);
        const isLinkDir = dirTypes.includes(unixFsLink?.type);

        if (isLinkDir) {
          result.size = 0;
          result.type = 'dir';
          result.contains = (await mixedLs(
            result.cid,
            externalCidMap,
            carryPath + '/' + result.name,
          )) as RecursiveLsResult[];
        } else {
          result.size = link.Tsize;
        }
      }
      tree.push(result);
    }
    return tree;
  } catch (err) {
    console.error(`Failed to resolve CID, err: `, err);
    return null;
  }
}

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
type FileInfo = { cid: string; size?: number };
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
  // const treehere = await getDirectoryTree(updatedTailNodeCid);

  const updatedDagCidMap: Record<oldCid, newCid> = {};

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
    const oldCid = currentNode.Links[dagIdx].Hash;
    // const oldLinkRemovedCid = await client.object.patch.rmLink(currentNodeCid, currentNode.Links[dagIdx]);
    // lastUpdatedCid = await addToDir(client, oldLinkRemovedCid, { [linkName]: { cid: lastUpdatedCid } });
    lastUpdatedCid = await updateDagCid(client, currentNodeCid, oldCid, lastUpdatedCid);
    updatedDagCidMap[oldCid.toString()] = lastUpdatedCid.toString();
    // oldToNewCidMap[oldCid] = lastUpdatedCid.toString();
  }

  return { updatedRootCid: lastUpdatedCid.toString(), updatedDagCidMap };
};

export const removeFileFromDag = async (rootCid: string, contextPath: string, fileNameToRemove: string) => {
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

  const { newDagCid: updatedTailNodeCid, removedLink } = await removeDagLink(tailNodeCid.toString(), fileNameToRemove);

  const updatedDagCidMap: Record<oldCid, newCid> = {};

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
    const oldCid = currentNode.Links[dagIdx].Hash;
    lastUpdatedCid = await updateDagCid(client, currentNodeCid, oldCid, lastUpdatedCid);
    updatedDagCidMap[oldCid.toString()] = lastUpdatedCid.toString();
  }

  return { updatedRootCid: lastUpdatedCid.toString(), updatedDagCidMap, removedLink };
};

export async function removeDagLink(dagCid: string | multiformats.CID, linkName: string) {
  if (typeof dagCid === 'string') dagCid = multiformats.CID.parse(dagCid);

  if (dagCid.code == rawCode) {
    throw new Error('raw cid -- not a directory');
  }

  const block = await client.block.get(dagCid);
  const { Data, Links } = dagPb.decode(block);

  const node = UnixFS.unmarshal(Data);

  if (!node.isDirectory()) {
    throw new Error(`file cid -- not a directory`);
  }
  const removedLink = Links.find((link) => link.Name === linkName);
  const newLinks = Links.filter((link) => link.Name !== linkName);

  if (newLinks.length === 0) {
    const nodeKeep = await client.add(Buffer.from(''), { cidVersion: 1 });
    newLinks.push({ Name: '.nodeKeep', Hash: nodeKeep.cid as any, Tsize: nodeKeep.size });
  }

  const newDagCid = await client.block.put(dagPb.encode(dagPb.prepare({ Data, Links: newLinks })), {
    version: 1,
    format: 'dag-pb',
  });
  return { newDagCid, removedLink: { [linkName]: removedLink } };
}

export const renameFileInDag = async (rootCid: string, contextPath: string, linkToRename: string, newName: string) => {
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

  const updatedTailNodeCid = await renameDagLink(tailNodeCid.toString(), linkToRename, newName);

  const updatedDagCidMap: Record<oldCid, newCid> = {};

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
    const oldCid = currentNode.Links[dagIdx].Hash;
    lastUpdatedCid = await updateDagCid(client, currentNodeCid, oldCid, lastUpdatedCid);
    updatedDagCidMap[oldCid.toString()] = lastUpdatedCid.toString();
  }

  return { updatedRootCid: lastUpdatedCid.toString(), updatedDagCidMap };
};

export const moveFileInDag = async (rootCid: string, contextPath: string, fileToMove: string, newPath: string) => {
  const {
    updatedRootCid: removedDagCid,
    updatedDagCidMap: removedDagCidMap,
    removedLink,
  } = await removeFileFromDag(rootCid, contextPath, fileToMove);

  const newPathSplit = newPath.split('/');
  const fileName = newPathSplit.pop();
  const newContextPath = newPathSplit.join('/');
  const formattedLink = {
    [fileName]: { cid: removedLink[fileToMove].Hash.toString(), size: removedLink[fileToMove].Tsize },
  };
  const { updatedRootCid, updatedDagCidMap } = await addFilesToDag(removedDagCid, newContextPath, formattedLink);

  for (const [key, val] of Object.entries(removedDagCidMap)) {
    // add updatedDagCids in remove step
    updatedDagCidMap[key] = val;
    // roll over the updatedDagCids
    if (val in updatedDagCidMap) {
      updatedDagCidMap[key] = updatedDagCidMap[val];
    }
  }

  return { updatedRootCid, updatedDagCidMap };
};

export async function renameDagLink(dagCid: string | multiformats.CID, linkName: string, newName: string) {
  if (typeof dagCid === 'string') dagCid = multiformats.CID.parse(dagCid);

  if (dagCid.code == rawCode) {
    throw new Error('raw cid -- not a directory');
  }

  const block = await client.block.get(dagCid);
  const { Data, Links } = dagPb.decode(block);

  const node = UnixFS.unmarshal(Data);

  if (!node.isDirectory()) {
    throw new Error(`file cid -- not a directory`);
  }

  const linkIdx = Links.findIndex((link) => link.Name === linkName);
  Links[linkIdx].Name = newName;

  return client.block.put(dagPb.encode(dagPb.prepare({ Data, Links })), {
    version: 1,
    format: 'dag-pb',
  });
}

export const createDag = async (files: FilesToAddToDag): Promise<string> => {
  return await makeDir(client, files);
};

export async function createEmptyDag() {
  const nodeKeepCid = await client.add(Buffer.from(''));
  const cid = await makeDir(client, { '.nodeKeep': { cid: nodeKeepCid.cid } });
  return cid.toString();
}

export interface GetExternalSizeAndTypeResult {
  isDirectory: boolean;
  size: number;
}

const dirTypes = ['directory', 'hamt-sharded-directory'];

export async function getExternalCidSizeAndType(cid: string) {
  try {
    const cidObject = multiformats.CID.parse(cid);
    const code = cidObject.code;
    const block = await publicIpfs.block.get(cidObject);
    if (cidObject.code === rawCode) {
      return { isDirectory: false, size: block.length };
    }
    const { Data } = dagPb.decode(block);

    const unixFs = UnixFS.unmarshal(Data);
    let isDirectory;
    let size;
    const isDir = dirTypes.includes(unixFs?.type);
    if (code === 0x70 && isDir) {
      //0x70 === dag-pb
      isDirectory = true;
      size = 0;
    } else {
      isDirectory = false;
      const fSize = unixFs.fileSize();
      if (fSize) {
        size = fSize;
      } else {
        // eslint-disable-next-line no-array-reduce/no-reduce
        size = unixFs.blockSizes.reduce((a, b) => a + b, 0);
      }
    }
    if (isDirectory !== undefined && size !== undefined) return { isDirectory, size };
    throw new Error(`Failed to resolve CID or determine file size/type for cid: ${cid}`);
  } catch (error) {
    console.error(`[getExternalCidSizeAndType]Error: ${error.message}`);
    return null;
  }
}

export interface ZipToDagAndPinResult {
  files: IpfsDirStructuredInput[];
  totalSize: number;
}

export async function zipToPinFormat(zipBuffer: Buffer, nameOverride?: string): Promise<ZipToDagAndPinResult> {
  return new Promise((resolve, reject) => {
    const files = [];
    let totalSize = 0;

    yauzl.fromBuffer(zipBuffer, { lazyEntries: true }, (err, zipfile) => {
      if (err) reject(err);

      zipfile.readEntry();

      zipfile.on('entry', (entry) => {
        if (!entry.isDirectory) {
          zipfile.openReadStream(entry, async (err, readStream) => {
            if (err) reject(err);
            const chunks = [];
            for await (const chunk of readStream) {
              chunks.push(chunk);
            }
            const fileBuffer = Buffer.concat(chunks);
            if (entry.uncompressedSize > 0) {
              totalSize += entry.uncompressedSize;
              if (nameOverride) entry.fileName = deneutralizePath(entry.fileName, nameOverride);
              files.push({
                path: entry.fileName,
                content: fileBuffer,
              });
            }
            zipfile.readEntry();
          });
        } else {
          zipfile.readEntry();
        }
      });

      zipfile.on('end', async () => {
        try {
          resolve({ files, totalSize });
        } catch (error) {
          reject(error);
        }
      });
    });
  });
}

export function strIsCid(cid: string) {
  try {
    const cidObj = multiformats.CID.parse(cid);
    const validCid = multiformats.CID.asCID(cidObj);

    if (!!validCid) return true;
    return false;
  } catch (e) {
    return false;
  }
}

export async function spawnEmptyManifest() {
  const emptyDagCid = await createEmptyDag();

  const dataBucketComponent: ResearchObjectV1Component = {
    id: 'root',
    name: 'root',
    type: ResearchObjectComponentType.DATA_BUCKET,
    payload: {
      cid: emptyDagCid,
      path: DRIVE_NODE_ROOT_PATH,
    },
  };

  const researchObject: ResearchObjectV1 = {
    version: 'desci-nodes-0.2.0',
    components: [dataBucketComponent],
    authors: [],
  };

  return researchObject;
}
export enum CidSource {
  INTERNAL = 'internal',
  EXTERNAL = 'external',
}

// assumeExternal is quicker, because it doesn't attempt to check if the CID is available via public resolution
// Note: when using this function the result can be impacted by the resolvers uptime
export async function checkCidSrc(cid: string, assumeExternal = false) {
  try {
    const internalStat = await client.block.stat(CID2.parse(cid), { timeout: INTERNAL_IPFS_TIMEOUT });
    if (internalStat) return CidSource.INTERNAL;
  } catch (err) {
    if (assumeExternal) return CidSource.EXTERNAL;
  }

  try {
    const externalStat = await publicIpfs.block.stat(CID2.parse(cid), { timeout: EXTERNAL_IPFS_TIMEOUT });
    if (externalStat) return CidSource.EXTERNAL;
  } catch (err) {
    console.log('CID not found in either internal or public IPFS, or resolution timed out. e: ', err);
    return false;
  }
  return false;
}
