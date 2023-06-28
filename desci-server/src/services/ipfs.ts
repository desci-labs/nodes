import fs from 'fs';
import https from 'https';
import { Readable } from 'stream';

import {
  CodeComponent,
  PdfComponent,
  ResearchObjectComponentType,
  ResearchObjectV1,
  ResearchObjectV1Component,
  deneutralizePath,
} from '@desci-labs/desci-models';
import * as dagPb from '@ipld/dag-pb';
import { PBNode } from '@ipld/dag-pb/src/interface';
import { DataReference, DataType, NodeVersion, Prisma } from '@prisma/client';
import axios from 'axios';
// import CID from 'cids';
import * as ipfs from 'ipfs-http-client';
import { CID as CID2, globSource } from 'ipfs-http-client';
import UnixFS from 'ipfs-unixfs';
import toBuffer from 'it-to-buffer';
import flatten from 'lodash/flatten';
import uniq from 'lodash/uniq';
import * as multiformats from 'multiformats';
import { code as rawCode } from 'multiformats/codecs/raw';

import prisma from 'client';
import { PUBLIC_IPFS_PATH } from 'config';
import parentLogger from 'logger';
import { getOrCache } from 'redisClient';
import { DRIVE_NODE_ROOT_PATH, ExternalCidMap, newCid, oldCid } from 'utils/driveUtils';
import { getGithubExternalUrl, processGithubUrl } from 'utils/githubUtils';
import { createManifest, getUrlsFromParam, makePublic } from 'utils/manifestDraftUtils';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { addToDir, concat, getSize, makeDir, updateDagCid } = require('../utils/dagConcat.cjs');
export const IPFS_PATH_TMP = '/tmp/ipfs';

const logger = parentLogger.child({
  module: 'Services::Ipfs',
});

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

const caBundle = fs.readFileSync('ssl/sealstorage-bundle.crt');
const agent = new https.Agent({ ca: caBundle });
// const PUBLIC_IPFS_RESOLVER = process.env.PUBLIC_IPFS_RESOLVER;
const PUBLIC_IPFS_RESOLVER = 'https://maritime.sealstorage.io';
export const publicIpfs = ipfs.create({ url: PUBLIC_IPFS_RESOLVER, agent, apiPath: '/ipfs/api/v0' });

// Timeouts for resolution on internal and external IPFS nodes, to prevent server hanging, in ms.
const INTERNAL_IPFS_TIMEOUT = 5000;
const EXTERNAL_IPFS_TIMEOUT = 120000;

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
  logger.trace(
    { fn: 'updateManifestAndAddToIpfs' },
    `[ipfs::updateManifestAndAddToIpfs] manifestCid=${result.cid} nodeVersion=${version}`,
  );
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
  logger.info({ fn: 'updateManifestAndAddToIpfs' }, '[dataReference Created]', ref);

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
  logger.trace({ fn: 'downloadFilesAndMakeManifest' }, `downloadFilesAndMakeManifest ${files}`);

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

  logger.debug({ fn: 'downloadFilesAndMakeManifest' }, 'RESEARCH OBJECT', JSON.stringify(researchObject));

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
  logger.trace({ fn: 'processUrls' }, `processUrls key: ${key}, data: ${data}`);

  return data.map(async (e, i) => {
    // if our payload points to github, download a zip of the main branch
    if (key === 'code') {
      if (e.indexOf('github.com') > -1) {
        const { branch, author, repo } = await processGithubUrl(e);

        const newUrl = `https://github.com/${author}/${repo}/archive/refs/heads/${branch}.zip`;
        logger.debug({ fn: 'processUrls' }, `NEW URL ${newUrl}`);
        e = newUrl;
      }
    }
    return downloadFile(e, key);
  });
};

export const downloadFile = async (url: string, key: string): Promise<UrlWithCid> => {
  logger.trace({ fn: 'downloadFile' }, 'createDraft::downloadFile', url.substring(0, 256), key);

  if (url.indexOf('data:') === 0) {
    const buf = Buffer.from(url.split(',')[1], 'base64');
    return addBufferToIpfs(buf, key);
  }

  return new Promise(async (resolve, reject) => {
    try {
      logger.info({ fn: 'downloadFile' }, `start download ${url.substring(0, 256)}`);
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
      logger.info({ fn: 'downloadFile' }, `finish download ${url.substring(0, 256)}`);

      resolve(addBufferToIpfs(data, key));
    } catch (err) {
      logger.error({ fn: 'downloadFile', err }, 'got error');
      logger.info({ fn: 'downloadFile' }, `try with playwright ${url.substring(0, 256)}`);
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
  content: Buffer | Readable;
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
  logger.debug({ fn: 'pinDirectory' }, `isOnline: ${isOnline}`);
  //possibly check if uploaded with a root dir, omit the wrapping if there is a root dir
  const uploaded: IpfsPinnedResult[] = [];
  const addAll = await client.addAll(files, { wrapWithDirectory: wrapWithDirectory, cidVersion: 1 });
  for await (const file of addAll) {
    uploaded.push({ path: file.path, cid: file.cid.toString(), size: file.size });
  }
  return uploaded;
};

export async function pinExternalDags(cids: string[]): Promise<string[]> {
  const result = [];
  let iterationCount = 0;
  for await (const cid of cids) {
    iterationCount++;
    logger.debug({ cid, fn: 'pinExternalDags', iterationCount }, `Pinning external dag ${cid}`);
    const cidType = multiformats.CID.parse(cid);
    const res = await getOrCache(`pin-block-${cid}`, async () => {
      const block = await publicIpfs.block.get(cidType);
      const blockRes = await client.block.put(block);
      return blockRes.toString();
    });
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

export const convertToCidV1 = (cid: string | multiformats.CID): string => {
  if (typeof cid === 'string') {
    const c = multiformats.CID.parse(cid);
    return c.toV1().toString();
  } else {
    const cV1 = cid.toV1().toString();
    return cV1;
  }
};

export const resolveIpfsData = async (cid: string): Promise<Buffer> => {
  try {
    logger.info({ fn: 'resolveIpfsData' }, `[ipfs:resolveIpfsData] START ipfs.cat cid= ${cid}`);
    const iterable = await readerClient.cat(cid);
    logger.info({ fn: 'resolveIpfsData' }, `[ipfs:resolveIpfsData] SUCCESS(1/2) ipfs.cat cid= ${cid}`);
    const dataArray = [];

    for await (const x of iterable) {
      dataArray.push(x);
    }
    logger.info(
      { fn: 'resolveIpfsData' },
      `[ipfs:resolveIpfsData] SUCCESS(2/2) ipfs.cat cid=${cid}, len=${dataArray.length}`,
    );

    return Buffer.from(dataArray);
  } catch (err) {
    const res = await client.dag.get(multiformats.CID.parse(cid));
    let targetValue = res.value.Data;
    if (!targetValue) {
      targetValue = res.value;
    }
    logger.error(
      { fn: 'resolveIpfsData', err },
      `[ipfs:resolveIpfsData] SUCCESS(2/2) DAG, ipfs.dag.get cid=${cid}, bufferLen=${targetValue.length}`,
    );
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
  logger.debug({ fn: 'convertToCidV0' }, `convertToCidV1' ${v0}`);

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

export const getDirectoryTree = async (
  cid: string,
  externalCidMap: ExternalCidMap,
  returnFiles = true,
): Promise<RecursiveLsResult[]> => {
  const isOnline = await client.isOnline();
  logger.info(
    { fn: 'getDirectoryTree' },
    `[getDirectoryTree]retrieving tree for cid: ${cid}, ipfs online: ${isOnline}`,
  );
  try {
    const tree = await getOrCache(`full-tree-${cid}${!returnFiles ? '-no-files' : ''}`, getTree);
    if (tree) return tree;
    throw new Error('[getDirectoryTree] Failed to retrieve tree from cache');
  } catch (err) {
    logger.warn({ fn: 'getDirectoryTree', err }, '[getDirectoryTree] error');
    logger.info('[getDirectoryTree] Falling back on uncached tree retrieval');
    return getTree();
  }
  async function getTree() {
    if (Object.keys(externalCidMap).length === 0) {
      logger.info({ fn: 'getDirectoryTree' }, `[getDirectoryTree] using standard ls, dagCid: ${cid}`);
      return await recursiveLs(cid);
    } else {
      logger.info({ fn: 'getDirectoryTree' }, `[getDirectoryTree] using mixed ls, dagCid: ${cid}`);
      const tree = await mixedLs(cid, externalCidMap, returnFiles);
      return tree;
    }
  }
};

export const recursiveLs = async (cid: string, carryPath?: string) => {
  carryPath = carryPath || convertToCidV1(cid);
  const tree = [];
  const promises = [];
  try {
    const lsOp = client.ls(cid, { timeout: INTERNAL_IPFS_TIMEOUT });

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
  } catch (err) {
    logger.error(
      { fn: 'recursiveLs', cid, carryPath, err },
      `[recursiveLs] error, cid may not exist in priv swarm or unmarked external cid`,
    );
  }
  await Promise.allSettled(promises);
  return tree;
};

//Used for recursively lsing a DAG containing both public and private cids
export async function mixedLs(
  dagCid: string,
  externalCidMap: ExternalCidMap,
  returnFiles = true,
  externalMode = false,
  carryPath?: string,
) {
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
      const toggleExternalMode = !!externalCidMapEntry || externalMode;
      if (toggleExternalMode) result.external = true;
      const isFile =
        (externalMode && !externalCidMapEntry) || (externalCidMapEntry && externalCidMapEntry.directory == false);
      const linkCidObject = multiformats.CID.parse(result.cid);
      if (linkCidObject.code === rawCode || isFile) {
        result.size = link.Tsize;
      } else {
        const linkBlock = await client.block.get(linkCidObject, { timeout: INTERNAL_IPFS_TIMEOUT });
        const { Data: linkData } = dagPb.decode(linkBlock);
        const unixFsLink = UnixFS.unmarshal(linkData);
        const isLinkDir = dirTypes.includes(unixFsLink?.type);

        if (isLinkDir) {
          result.size = 0;
          result.type = 'dir';
          result.contains = (await mixedLs(
            result.cid,
            externalCidMap,
            returnFiles,
            toggleExternalMode,
            carryPath + '/' + result.name,
          )) as RecursiveLsResult[];
        } else {
          result.size = link.Tsize;
        }
      }
      if (returnFiles) {
        tree.push(result);
      } else if (!returnFiles && result.type === 'dir') {
        tree.push(result);
      }
      resolve();
    });
    promises.push(promise);
  }
  await Promise.allSettled(promises);
  return tree;
}

export const pubRecursiveLs = async (cid: string, carryPath?: string) => {
  return await getOrCache(`tree-chunk-${cid}-${carryPath}`, async () => {
    logger.info({ fn: 'pubRecursiveLs', cid, carryPath }, 'Tree chunk not cached, retrieving from IPFS');
    carryPath = carryPath || convertToCidV1(cid);
    const tree = [];
    const lsOp = await publicIpfs.ls(cid, { timeout: EXTERNAL_IPFS_TIMEOUT });
    for await (const filedir of lsOp) {
      const res: any = filedir;
      const pathSplit = res.path.split('/');
      pathSplit[0] = carryPath;
      res.path = pathSplit.join('/');
      const v1StrCid = convertToCidV1(res.cid);
      if (filedir.type === 'file') tree.push({ ...res, cid: v1StrCid });
      if (filedir.type === 'dir') {
        res.cid = v1StrCid;
        res.contains = await pubRecursiveLs(res.cid, carryPath + '/' + res.name);
        tree.push({ ...res, cid: v1StrCid });
      }
    }
    return tree;
  });
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
          result.contains = (await discoveryLs(
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
    logger.warn({ fn: 'discoveryLs', err }, `Failed to resolve CID`);
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
    }
    if (fd.type === 'dir') {
      filesAndPaths.push(await getFilesAndPaths(fd));
    }
  });
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
    logger.error({ fn: 'isDir', error }, `Failed checking if CID is dir`);
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
    logger.error({ fn: 'getExternalCidSizeAndType', error }, `[getExternalCidSizeAndType]Error: ${error.message}`);
    return null;
  }
}

export interface ZipToDagAndPinResult {
  files: IpfsDirStructuredInput[];
  totalSize: number;
}

// Adds a directory to IPFS and deletes the directory after, returning the root CID
export async function addDirToIpfs(directoryPath: string): Promise<IpfsPinnedResult[]> {
  // Add all files in the directory to IPFS using globSource
  const files = [];
  for await (const file of client.addAll(globSource(directoryPath, '**/*'))) {
    files.push({ path: file.path, cid: file.cid.toString(), size: file.size });
  }
  logger.info({ fn: 'addFilesToIpfsAndCleanup', files }, 'Files added to IPFS:');

  return files;
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
    logger.warn(
      { fn: 'checkCidSrc', err },
      'CID not found in either internal or public IPFS, or resolution timed out.',
    );
    return false;
  }
  return false;
}
