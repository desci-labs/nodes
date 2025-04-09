import fs from 'fs';
import https from 'https';
import { Readable } from 'stream';

import {
  ResearchObjectComponentType,
  type ResearchObjectV1,
  type ResearchObjectV1Component,
} from '@desci-labs/desci-models';
import type { PBNode } from '@ipld/dag-pb';
import * as dagPb from '@ipld/dag-pb';
import { DataReference, DataType, NodeVersion } from '@prisma/client';
import { UnixFS } from 'ipfs-unixfs';
import toBuffer from 'it-to-buffer';
import { create, CID, globSource, IPFSHTTPClient } from 'kubo-rpc-client';
import { flatten, uniq } from 'lodash-es';
import * as multiformats from 'multiformats';
import { code as rawCode } from 'multiformats/codecs/raw';

import { prisma } from '../client.js';
import { PUBLIC_IPFS_PATH } from '../config/index.js';
import { logger as parentLogger } from '../logger.js';
import { getOrCache } from '../redisClient.js';
import { addToDir, getSize, makeDir, updateDagCid } from '../utils/dagConcat.js';
import { DRIVE_NODE_ROOT_PATH, type ExternalCidMap, type newCid, type oldCid } from '../utils/driveUtils.js';
import { createManifest } from '../utils/manifestDraftUtils.js';

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
//
const cert = fs.readFileSync('./src/ssl/sealstorage-bundle.crt');
const httpsAgent = new https.Agent({
  ca: cert,
});

// connect to a different API
export const client: IPFSHTTPClient = create({ url: process.env.IPFS_NODE_URL });
export const readerClient: IPFSHTTPClient = create({ url: PUBLIC_IPFS_PATH });

export const guestIpfsClient: IPFSHTTPClient = create({ url: process.env.GUEST_IPFS_NODE_URL });

export const publicIpfs = create({ url: process.env.PUBLIC_IPFS_RESOLVER + '/api/v0', options: { agent: httpsAgent } });

export enum IPFS_NODE {
  PRIVATE = 'private',
  GUEST = 'guest',
  PUBLIC = 'public',
}

export const getIpfsClient = (node: IPFS_NODE = IPFS_NODE.PRIVATE): IPFSHTTPClient => {
  switch (node) {
    case IPFS_NODE.PRIVATE:
      return client;
    case IPFS_NODE.GUEST:
      return guestIpfsClient;
    case IPFS_NODE.PUBLIC:
      return readerClient;
  }
};
// Timeouts for resolution on internal and external IPFS nodes, to prevent server hanging, in ms.
const INTERNAL_IPFS_TIMEOUT = 30_000;
// We mostly fetch single blocks, so this does not limit transfers
const EXTERNAL_IPFS_TIMEOUT = 30_000;

export const getNodeToUse = (isGuest?: boolean) => {
  if (isGuest) {
    return IPFS_NODE.GUEST;
  }
  return IPFS_NODE.PRIVATE;
};

export const updateManifestAndAddToIpfs = async (
  manifest: ResearchObjectV1,
  { userId, nodeId, ipfsNode }: { userId: number; nodeId: number; ipfsNode?: IPFS_NODE },
): Promise<{ cid: string; size: number; ref: DataReference; nodeVersion: NodeVersion }> => {
  const result = await addBufferToIpfs(createManifest(manifest), '', ipfsNode);
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

export const addBufferToIpfs = async (
  buf: Buffer,
  key: string,
  node?: IPFS_NODE,
): Promise<{ cid: string; size: number; key: string }> => {
  const { cid, size } = await getIpfsClient(node).add(buf, { cidVersion: 1 });
  return { cid: cid.toString(), size: Number(size), key };
};

export const getSizeForCid = async (cid: string, asDirectory: boolean | undefined): Promise<number> => {
  return await getSize(client, cid, asDirectory);
};

export const makeManifest = async ({
  title,
  defaultLicense,
  researchFields,
  ipfsNode,
}: {
  title: string;
  defaultLicense: string;
  researchFields: string[];
  ipfsNode: IPFS_NODE;
}) => {
  logger.trace({ fn: 'downloadFilesAndMakeManifest' }, `downloadFilesAndMakeManifest`);

  // make manifest

  const researchObject: ResearchObjectV1 = {
    version: 'desci-nodes-0.2.0',
    components: [],
    authors: [],
  };

  const emptyDagCid = await createEmptyDag(ipfsNode);

  const dataBucketComponent: ResearchObjectV1Component = {
    id: 'root',
    name: 'root',
    type: ResearchObjectComponentType.DATA_BUCKET,
    payload: {
      cid: emptyDagCid,
      path: DRIVE_NODE_ROOT_PATH,
    },
  };

  researchObject.title = title;
  researchObject.defaultLicense = defaultLicense;
  researchObject.researchFields = researchFields;
  researchObject.components = researchObject.components.concat(dataBucketComponent);

  logger.debug({ fn: 'downloadFilesAndMakeManifest' }, 'RESEARCH OBJECT', JSON.stringify(researchObject));

  const manifest = createManifest(researchObject);

  return { manifest, researchObject };
};

export interface IpfsDirStructuredInput {
  path: string;
  content: Buffer | Readable | ReadableStream;
}

export interface IpfsPinnedResult {
  path: string;
  cid: string;
  size: number;
}

export const pinDirectory = async (
  files: IpfsDirStructuredInput[],
  options?: {
    wrapWithDirectory?: boolean;
    node?: IPFS_NODE;
  },
): Promise<IpfsPinnedResult[]> => {
  options = {
    // Set defaults
    wrapWithDirectory: false,
    node: IPFS_NODE.PRIVATE,
    ...options,
  };
  const isOnline = await getIpfsClient(options.node).isOnline();
  logger.debug({ fn: 'pinDirectory' }, `isOnline: ${isOnline}`);
  //possibly check if uploaded with a root dir, omit the wrapping if there is a root dir
  const uploaded: IpfsPinnedResult[] = [];
  const addAll = await getIpfsClient(options.node).addAll(files, {
    wrapWithDirectory: options.wrapWithDirectory,
    cidVersion: 1,
  });
  for await (const file of addAll) {
    uploaded.push({ path: file.path, cid: file.cid.toString(), size: file.size });
  }
  return uploaded;
};

export const pinFile = async (
  file: Buffer | Readable | ReadableStream,
  { ipfsNode = IPFS_NODE.PRIVATE }: { ipfsNode?: IPFS_NODE },
): Promise<IpfsPinnedResult> => {
  const isOnline = await getIpfsClient(ipfsNode).isOnline();
  // debugger;
  logger.debug({ fn: 'pinFile' }, `isOnline: ${isOnline}`);
  const uploadedFile = await getIpfsClient(ipfsNode).add(file, { cidVersion: 1, pin: true });
  return { ...uploadedFile, cid: uploadedFile.cid.toString() };
};

export interface RecursiveLsResult extends IpfsPinnedResult {
  name: string;
  contains?: RecursiveLsResult[];
  type: 'dir' | 'file';
  parent?: RecursiveLsResult;
  external?: boolean;
}

export const convertToCidV1 = (cid: string | multiformats.CID): string => {
  if (typeof cid === 'string') {
    cid = multiformats.CID.parse(cid);
  }
  return cid.toV1().toString();
};

/**
 * @deprecated Hasn't been in use for a long time, review before usage - may be useful for data migration.
 */
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

    return Buffer.from(targetValue);
  }
};

export const convertToCidV0 = (cid: string) => {
  const c = multiformats.CID.parse(cid);
  const v0 = c.toV0();
  logger.debug({ fn: 'convertToCidV0' }, `convertToCidV1' ${v0}`);

  return v0.toString();
};

export const getDirectoryTreeCids = async (
  cid: string,
  externalCidMap: ExternalCidMap,
  ipfsNode = IPFS_NODE.PRIVATE,
): Promise<string[]> => {
  const tree = await getDirectoryTree(cid, externalCidMap, { ipfsNode });
  const recurse = (arr: RecursiveLsResult[]) => {
    return arr.flatMap((e) => {
      if (e && e.contains) {
        return flatten([recurse(e.contains), e.parent, e.path.split('/')[0], e.cid]);
      } else {
        return e;
      }
    });
  };
  const flatCids = uniq<string>(
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
  {
    returnFiles = true,
    returnExternalFiles = true,
    ipfsNode = IPFS_NODE.PRIVATE,
  }: {
    returnFiles?: boolean;
    returnExternalFiles?: boolean;
    ipfsNode?: IPFS_NODE;
  } = {},
): Promise<RecursiveLsResult[]> => {
  const isOnline = await getIpfsClient(ipfsNode).isOnline();
  logger.info(
    { fn: 'getDirectoryTree', cid, returnFiles, returnExternalFiles },
    `[getDirectoryTree]retrieving tree for cid: ${cid}, ipfs online: ${isOnline}`,
  );

  const startTime = process.hrtime();
  const treeRes = await getTree();
  const endTime = process.hrtime(startTime);
  logger.info(`[getDirectoryTree] Execution time: ${endTime[0]}s ${endTime[1] / 1000000}ms`);
  return treeRes;

  async function getTree() {
    if (Object.keys(externalCidMap).length === 0) {
      logger.info({ fn: 'getDirectoryTree' }, `[getDirectoryTree] using standard ls, dagCid: ${cid}`);
      return await recursiveLs(cid, { ipfsNode });
    } else {
      logger.info({ fn: 'getDirectoryTree' }, `[getDirectoryTree] using mixed ls, dagCid: ${cid}`);
      return await mixedLs(cid, externalCidMap, {
        returnFiles,
        returnExternalFiles,
        ipfsNode,
      });
    }
  }
};

export const recursiveLs = async (
  cid: string,
  { carryPath, ipfsNode = IPFS_NODE.PRIVATE }: { carryPath?: string; ipfsNode?: IPFS_NODE },
) => {
  carryPath = carryPath || convertToCidV1(cid);
  const tree = [];
  const promises = [];
  try {
    const lsOp = getIpfsClient(ipfsNode).ls(cid, { timeout: INTERNAL_IPFS_TIMEOUT });

    for await (const filedir of lsOp) {
      const promise = new Promise<void>(async (resolve, _reject) => {
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
          res.contains = await recursiveLs(res.cid, { carryPath: carryPath + '/' + res.name, ipfsNode });
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
  {
    returnFiles = true,
    returnExternalFiles = true,
    externalMode = false,
    carryPath,
    ipfsNode = IPFS_NODE.PRIVATE,
  }: {
    returnFiles?: boolean;
    returnExternalFiles?: boolean;
    externalMode?: boolean;
    carryPath?: string;
    ipfsNode?: IPFS_NODE;
  },
) {
  carryPath = carryPath || convertToCidV1(dagCid);
  const tree: RecursiveLsResult[] = [];
  const cidObject = multiformats.CID.parse(dagCid);
  let block: Uint8Array;
  try {
    block = await getIpfsClient(ipfsNode).block.get(cidObject, { timeout: INTERNAL_IPFS_TIMEOUT }); //instead of throwing, catch and print cid
  } catch (err) {
    logger.error(
      { fn: 'mixedLs', cid: dagCid, carryPath, err },
      `[mixedLs] error, cid may not exist in priv swarm or unmarked external cid`,
    );
  }
  const { Data, Links } = dagPb.decode(block);
  const unixFs = UnixFS.unmarshal(Data);
  const isDir = dirTypes.includes(unixFs?.type);
  if (!isDir) return null;
  const promises: Promise<any>[] = [];
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
        let linkBlock: Uint8Array;
        try {
          linkBlock = await getIpfsClient(ipfsNode).block.get(linkCidObject, { timeout: INTERNAL_IPFS_TIMEOUT }); //instead of throwing, catch and print cid
        } catch (err) {
          logger.error(
            { fn: 'mixedLs', cid: linkCidObject.toString(), carryPath, err },
            `[mixedLs] error, cid may not exist in priv swarm or unmarked external cid`,
          );
        }
        const { Data: linkData } = dagPb.decode(linkBlock);
        const unixFsLink = UnixFS.unmarshal(linkData);
        const isLinkDir = dirTypes.includes(unixFsLink?.type);

        if (isLinkDir) {
          result.size = 0;
          result.type = 'dir';
          result.contains = (await mixedLs(result.cid, externalCidMap, {
            returnFiles,
            returnExternalFiles,
            externalMode: toggleExternalMode,
            carryPath: carryPath + '/' + result.name,
            ipfsNode,
          })) as RecursiveLsResult[];
        } else {
          result.size = link.Tsize;
        }
      }
      if (returnFiles && returnExternalFiles) {
        // if return files and return external files are both true, push files+dirs
        tree.push(result);
      } else if (returnFiles && !returnExternalFiles) {
        // if return files is true and return external files is false, push files+dirs except external files
        if (result.type === 'file' && result.external !== true) tree.push(result);
        if (result.type === 'dir') tree.push(result);
      } else if (!returnFiles && result.type === 'dir') {
        // only return dirs if return files is false
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
  return await getOrCache(`tree-chunk-${cid}-${carryPath}-${Date.now()}`, async () => {
    logger.info({ fn: 'pubRecursiveLs', cid, carryPath }, 'Tree chunk not cached, retrieving from IPFS');
    carryPath = carryPath || convertToCidV1(cid);
    const tree: any[] = [];
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
export async function discoveryLs(
  dagCid: string,
  externalCidMap: ExternalCidMap,
  { carryPath, ipfsNode = IPFS_NODE.PRIVATE }: { carryPath?: string; ipfsNode?: IPFS_NODE } = {},
) {
  console.log('extCidMap', externalCidMap);
  try {
    carryPath = carryPath || convertToCidV1(dagCid);
    const tree: RecursiveLsResult[] = [];
    const cidObject = multiformats.CID.parse(dagCid);
    let block = await getIpfsClient(ipfsNode).block.get(cidObject, { timeout: INTERNAL_IPFS_TIMEOUT });
    if (!block) {
      block = await publicIpfs.block.get(cidObject, { timeout: INTERNAL_IPFS_TIMEOUT });
    }
    if (!block) {
      throw new Error('Could not find block for cid: ' + dagCid);
    }
    const { Data, Links } = dagPb.decode(block);
    const unixFs = UnixFS.unmarshal(Data);
    const isDir = dirTypes.includes(unixFs?.type);
    if (!isDir) {
      return null;
    }
    for (const link of Links) {
      const result: RecursiveLsResult = {
        name: link.Name,
        path: carryPath + '/' + link.Name,
        cid: convertToCidV1(link.Hash.toString()),
        size: 0,
        type: 'file',
      };
      const externalCidMapEntry = externalCidMap[result.cid];
      if (externalCidMapEntry) {
        result.external = true;
      }
      const isExternalFile = externalCidMapEntry && externalCidMapEntry.directory == false;
      const linkCidObject = multiformats.CID.parse(result.cid);
      if (linkCidObject.code === rawCode || isExternalFile) {
        result.size = link.Tsize;
      } else {
        let linkBlock = await getIpfsClient(ipfsNode).block.get(linkCidObject, { timeout: INTERNAL_IPFS_TIMEOUT });
        if (!linkBlock) {
          linkBlock = await publicIpfs.block.get(cidObject, { timeout: EXTERNAL_IPFS_TIMEOUT });
        }
        if (!linkBlock) {
          throw new Error('Could not find block for cid: ' + dagCid);
        }
        const { Data: linkData } = dagPb.decode(linkBlock);
        const unixFsLink = UnixFS.unmarshal(linkData);
        const isLinkDir = dirTypes.includes(unixFsLink?.type);

        if (isLinkDir) {
          result.size = 0;
          result.type = 'dir';
          result.contains = (await discoveryLs(result.cid, externalCidMap, {
            carryPath: carryPath + '/' + result.name,
            ipfsNode,
          })) as RecursiveLsResult[];
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

export const isDir = async (cid: CID, ipfsNode = IPFS_NODE.PRIVATE): Promise<boolean> => {
  try {
    const files = await getIpfsClient(ipfsNode).ls(cid);

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

export const createDag = async (files: FilesToAddToDag, ipfsNode = IPFS_NODE.PRIVATE): Promise<string> => {
  return await makeDir(getIpfsClient(ipfsNode), files);
};

export async function createEmptyDag(ipfsNode = IPFS_NODE.PRIVATE) {
  const nodeKeepCid = await getIpfsClient(ipfsNode).add(Buffer.from(''));
  const cid = await makeDir(getIpfsClient(ipfsNode), { '.nodeKeep': { cid: nodeKeepCid.cid } });
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
    let isDirectory: boolean;
    let size: number;
    const isDir = dirTypes.includes(unixFs?.type);
    if (code === 0x70 && isDir) {
      //0x70 === dag-pb
      isDirectory = true;
      size = 0;
    } else {
      isDirectory = false;
      const fSize = unixFs.fileSize();
      if (fSize) {
        size = Number(fSize);
      } else {
        size = unixFs.blockSizes.map(Number).reduce((a, b) => a + b, 0);
      }
    }
    if (size !== undefined) {
      return { isDirectory, size };
    }
    throw new Error(`Failed to resolve CID or determine file size/type for cid: ${cid}`);
  } catch (error) {
    logger.error({ fn: 'getExternalCidSizeAndType', error }, `[getExternalCidSizeAndType]Error: ${error.message}`);
    return null;
  }
}

// Adds a directory to IPFS and deletes the directory after, returning the root CID
export async function addDirToIpfs(directoryPath: string, ipfsNode = IPFS_NODE.PRIVATE): Promise<IpfsPinnedResult[]> {
  // Add all files in the directory to IPFS using globSource
  const files = [];

  const source = globSource(directoryPath, '**/*', { hidden: true });
  for await (const file of getIpfsClient(ipfsNode).addAll(source, { cidVersion: 1 })) {
    files.push({ path: file.path, cid: file.cid.toString(), size: file.size });
  }
  const totalFiles = files.length;
  const rootDag = files[totalFiles - 1];
  logger.info({ fn: 'addFilesToIpfsAndCleanup', rootDag, totalFiles }, 'Files added to IPFS:');
  return files;
}

export function strIsCid(cid: string) {
  try {
    const cidObj = multiformats.CID.parse(cid);
    const validCid = multiformats.CID.asCID(cidObj);

    return !!validCid;
  } catch (e) {
    return false;
  }
}

export async function spawnEmptyManifest(ipfsNode: IPFS_NODE) {
  const emptyDagCid = await createEmptyDag(ipfsNode);

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

export type BlockMetadata = {
  Hash: { '/': string };
  NumLinks: number;
  BlockSize: number;
  LinkSize: number;
  DataSize: number;
  CumulativeSize: number;
};
export async function getCidMetadata(
  cid: string,
  { external = false, ipfsNode = IPFS_NODE.PRIVATE }: { external?: boolean; ipfsNode?: IPFS_NODE },
): Promise<BlockMetadata | null> {
  try {
    let metadata: BlockMetadata;
    if (external) {
      metadata = await publicIpfs.object.stat(CID.parse(cid), { timeout: EXTERNAL_IPFS_TIMEOUT });
    } else {
      metadata = await getIpfsClient(ipfsNode).object.stat(CID.parse(cid), { timeout: INTERNAL_IPFS_TIMEOUT });
    }

    return metadata;
  } catch (e) {
    logger.trace({ fn: 'getCidMetadata', cid, e }, 'Failed to get CID metadata');
    return null;
  }
}
