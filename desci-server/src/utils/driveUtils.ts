import { randomUUID } from 'crypto';

import {
  DEFAULT_COMPONENT_TYPE,
  DrivePath,
  FileExtension,
  ResearchObjectComponentSubtypes,
  ResearchObjectComponentType,
  ResearchObjectV1,
  ResearchObjectV1Component,
  fillIpfsTree,
  isNodeRoot,
  isResearchObjectComponentTypeMap,
} from '@desci-labs/desci-models';
import { DataReference, DataType } from '@prisma/client';

import prisma from 'client';
import { DataReferenceSrc } from 'controllers/data';
import { separateFileNameAndExtension } from 'controllers/data/utils';
import logger from 'logger';
import { getOrCache } from 'redisClient';
import { getDirectoryTree, RecursiveLsResult } from 'services/ipfs';
import { getIndexedResearchObjects } from 'theGraph';

export function fillDirSizes(tree, cidInfoMap) {
  const contains = [];
  tree.forEach((fd) => {
    if (fd.type === 'dir') {
      fd.size = cidInfoMap[fd.cid]?.size || 0;
      fd.contains = fillDirSizes(fd.contains, cidInfoMap);
    }
    // debugger
    fd.date = cidInfoMap[fd.cid]?.date || Date.now();
    fd.published = cidInfoMap[fd.cid]?.published;
    contains.push(fd);
  });
  return contains;
}

// Fills in the access status of CIDs and dates
export function fillCidInfo(tree, cidInfoMap) {
  // debugger;
  const contains = [];
  tree.forEach((fd) => {
    if (fd.type === 'dir' && fd.contains?.length) fd.contains = fillCidInfo(fd.contains, cidInfoMap);
    fd.date = cidInfoMap[fd.cid]?.date || Date.now();
    fd.published = cidInfoMap[fd.cid]?.published;
    contains.push(fd);
  });
  return contains;
}

interface CidEntryDetails {
  size?: number;
  published?: boolean;
  date?: string;
}

//deprecated tree filling function, used for old datasets, pre unopinionated data model
export async function getTreeAndFillDeprecated(
  rootCid: string,
  nodeUuid: string,
  dataSrc: DataReferenceSrc,
  ownerId?: number,
) {
  //NOTE/TODO: Adapted for priv(owner) and public (unauthed), may not work for node sharing users(authed/contributors)
  const externalCidMap = await generateExternalCidMap(nodeUuid + '.');
  const tree: RecursiveLsResult[] = await getDirectoryTree(rootCid, externalCidMap);

  /*
   ** Get all entries for the nodeUuid, for filling the tree
   */
  const dbEntries =
    dataSrc === DataReferenceSrc.PRIVATE
      ? await prisma.dataReference.findMany({
          where: {
            userId: ownerId,
            type: { not: DataType.MANIFEST },
            rootCid: rootCid,
            // cid: { in: dirCids },
            node: {
              uuid: nodeUuid + '.',
            },
          },
        })
      : await prisma.publicDataReference.findMany({
          where: {
            type: { not: DataType.MANIFEST },
            // cid: { in: dirCids },
            // rootCid: rootCid,
            node: {
              uuid: nodeUuid + '.',
            },
          },
        });

  // Necessary to determine if any private entries are already published
  const pubEntries =
    dataSrc === DataReferenceSrc.PRIVATE
      ? await prisma.publicDataReference.findMany({
          where: {
            type: { not: DataType.MANIFEST },
            node: {
              uuid: nodeUuid + '.',
            },
          },
        })
      : null;

  const cidInfoMap: Record<string, CidEntryDetails> = {};
  if (dbEntries.length) {
    const pubCids = pubEntries ? pubEntries.map((e) => e.cid) : null;
    // debugger
    dbEntries.forEach((d) => {
      const isPublished = dataSrc === DataReferenceSrc.PUBLIC ? true : pubCids.includes(d.cid);
      const entryDetails = {
        size: d.size || 0,
        published: isPublished,
        date: d.createdAt?.toString(),
        external: d.external ? true : false,
      };
      cidInfoMap[d.cid] = entryDetails;
    });
  }

  const filledTree = fillDirSizes(tree, cidInfoMap);

  return filledTree;
}

export async function getTreeAndFill(
  manifest: ResearchObjectV1,
  nodeUuid: string,
  ownerId?: number,
  published?: boolean,
) {
  // debugger;
  const rootCid = manifest.components.find((c) => isNodeRoot(c)).payload.cid;
  const externalCidMap = published
    ? await generateExternalCidMap(nodeUuid + '.', rootCid)
    : await generateExternalCidMap(nodeUuid + '.');
  let tree: RecursiveLsResult[] = await getDirectoryTree(rootCid, externalCidMap);

  /*
   ** Get all entries for the nodeUuid, for filling the tree
   ** Both entries neccessary to determine publish state, prioritize public entries over private
   */
  const privEntries = await prisma.dataReference.findMany({
    where: {
      userId: ownerId,
      type: { not: DataType.MANIFEST },
      rootCid: rootCid,
      node: {
        uuid: nodeUuid + '.',
      },
    },
  });
  const pubEntries = await prisma.publicDataReference.findMany({
    where: {
      type: { not: DataType.MANIFEST },
      node: {
        uuid: nodeUuid + '.',
      },
    },
    include: {
      nodeVersion: true,
    },
  });

  const cidInfoMap: Record<string, CidEntryDetails> = {};
  if (privEntries.length | pubEntries.length) {
    const pubCids: Record<string, boolean> = {};
    pubEntries.forEach((e) => (pubCids[e.cid] = true));
    // debugger;
    // Build cidInfoMap
    privEntries.forEach((ref) => {
      if (pubCids[ref.cid]) return; // Skip if there's a pub entry
      const entryDetails = {
        size: ref.size || 0,
        published: false,
        date: ref.createdAt?.getTime().toString(),
        external: ref.external ? true : false,
      };
      cidInfoMap[ref.cid] = entryDetails;
    });
    const promises = pubEntries.map(async (ref) => {
      const blockTime = await getBlockTime(nodeUuid, ref.nodeVersion.transactionId);
      const date = !!blockTime && blockTime !== '-1' ? blockTime : ref.createdAt?.getTime().toString();
      const entryDetails = {
        size: ref.size || 0,
        published: true,
        date: date,
        external: ref.external ? true : false,
      };
      cidInfoMap[ref.cid] = entryDetails;
    });

    await Promise.all(promises);
  }

  tree = fillCidInfo(tree, cidInfoMap);
  debugger;
  const treeRoot = await fillIpfsTree(manifest, tree);

  return treeRoot;
}

export async function getBlockTime(nodeUuid: string, txHash: string) {
  let blockTime;
  try {
    blockTime = await getOrCache(`txHash-blockTime-${txHash}`, retrieveBlockTime);
    if (blockTime !== '-1' && !blockTime) throw new Error('[getBlockTime] Failed to retrieve blocktime from cache');
  } catch (err) {
    logger.warn({ fn: 'getBlockTime', err, nodeUuid, txHash }, '[getBlockTime] error');
    logger.info('[getBlockTime] Falling back on uncached tree retrieval');
    return await retrieveBlockTime();
  }
  return blockTime === '-1' ? null : blockTime;

  async function retrieveBlockTime() {
    const { researchObjects } = await getIndexedResearchObjects([nodeUuid]);
    if (!researchObjects.length)
      logger.warn({ fn: 'getBlockTime' }, `No research objects found for nodeUuid ${nodeUuid}`);
    const indexedNode = researchObjects[0];
    const correctVersion = indexedNode.versions.find((v) => v.id === txHash);
    if (!correctVersion) {
      logger.warn({ fn: 'getBlockTime', nodeUuid, txHash }, `No version match was found for nodeUuid/txHash`);
      return '-1';
    }
    return correctVersion.time;
  }
}

export const gbToBytes = (gb: number) => gb * 1000000000;
export const bytesToGb = (bytes: number) => bytes / 1000000000;

export const ROTypesToPrismaTypes = {
  [ResearchObjectComponentType.DATA]: DataType.DATASET,
  [ResearchObjectComponentType.PDF]: DataType.DOCUMENT,
  [ResearchObjectComponentType.CODE]: DataType.CODE_REPOS,
  [ResearchObjectComponentType.VIDEO]: DataType.VIDEOS,
  [ResearchObjectComponentType.DATA_BUCKET]: DataType.DATA_BUCKET,
};

/**
 * Converts desci-models component types into the database types auto genereated via the prisma schema.
 * If a component type map is used as the component type, it would return the data bucket type if the component represents the node root,
 * else it returns the default component type.
 */
export function getDbComponentType(component: ResearchObjectV1Component) {
  if (isNodeRoot(component)) return ROTypesToPrismaTypes[ResearchObjectComponentType.DATA_BUCKET];
  return isResearchObjectComponentTypeMap(component.type)
    ? ROTypesToPrismaTypes[DEFAULT_COMPONENT_TYPE]
    : ROTypesToPrismaTypes[component.type];
}

export type ExtensionDataTypeMap = Record<FileExtension, DataType>;
export function generateManifestPathsToDbTypeMap(manifest: ResearchObjectV1) {
  const manifestPathsToTypes: Record<DrivePath, DataType | ExtensionDataTypeMap> = {};
  manifest.components.forEach((c) => {
    if (c.payload?.path) {
      const dbType: DataType = getDbComponentType(c);
      if (dbType) manifestPathsToTypes[c.payload.path] = dbType;
    }
  });
  manifestPathsToTypes[DRIVE_NODE_ROOT_PATH] = DataType.DATA_BUCKET;
  return manifestPathsToTypes;
}

/**
 * Inherits component types from the most specific node/parent
 * NOTE: Used for DB DataType, not ResearchObjectComponentType!
 */
export function inheritComponentType(path, pathToDbTypeMap: Record<string, DataType | ExtensionDataTypeMap>): DataType {
  let naturalType = pathToDbTypeMap[path];
  if (isResearchObjectComponentTypeMap(naturalType)) {
    // Extract extension from path
    const { extension } = separateFileNameAndExtension(path);
    // See if extension lives inside the map
    if (extension && naturalType[extension]) {
      naturalType = (naturalType as ExtensionDataTypeMap)[extension];
    } else {
      // Fallback on DEFAULT_COMPONENT_TYPE
      const defaultDataType = ROTypesToPrismaTypes[DEFAULT_COMPONENT_TYPE];
      naturalType = defaultDataType;
    }
  }
  if (naturalType && naturalType !== DataType.UNKNOWN) return naturalType as DataType;
  const pathSplit = path.split('/');
  if (pathSplit.length < 3) return DataType.UNKNOWN;
  while (pathSplit.length > 1) {
    pathSplit.pop();
    const parentPath = pathSplit.join('/');
    const parent = pathToDbTypeMap[parentPath];
    if (parent && parent !== DataType.UNKNOWN) {
      return parent as DataType;
    }
  }
  return DataType.UNKNOWN;
}

/* 
Inconsistent use of URL and CID within the manifest payloads, PDFs and Code Repos use .url,
 others generally use .cid, this helper function fetches the appropriate property
  */
export function urlOrCid(cid: string, type: ResearchObjectComponentType) {
  switch (type) {
    case ResearchObjectComponentType.PDF:
    case ResearchObjectComponentType.CODE:
    case ResearchObjectComponentType.LINK:
      return { url: cid };
    case ResearchObjectComponentType.DATA:
    case ResearchObjectComponentType.DATA_BUCKET:
      return { cid };
    default:
      return { cid };
  }
}

export const DRIVE_NODE_ROOT_PATH = 'root';

export interface FirstNestingComponent {
  name: string;
  path: string;
  cid: string;
  componentType?: ResearchObjectComponentType;
  componentSubtype?: ResearchObjectComponentSubtypes;
  star?: boolean;
  externalUrl?: string;
}
export function addComponentsToManifest(manifest: ResearchObjectV1, firstNestingComponents: FirstNestingComponent[]) {
  //add duplicate path check
  firstNestingComponents.forEach((c) => {
    const comp = {
      id: randomUUID(),
      name: c.name,
      ...(c.componentType && { type: c.componentType }),
      ...(c.componentSubtype && { subtype: c.componentSubtype }),
      payload: {
        ...urlOrCid(c.cid, c.componentType),
        path: c.path,
        ...(c.externalUrl && { externalUrl: c.externalUrl }),
      },
      starred: c.star || false,
    };
    manifest.components.push(comp);
  });
  return manifest;
}

export type oldCid = string;
export type newCid = string;
export function updateManifestComponentDagCids(manifest: ResearchObjectV1, updatedDagCidMap: Record<oldCid, newCid>) {
  manifest.components.forEach((c) => {
    if (c.payload?.cid in updatedDagCidMap) c.payload.cid = updatedDagCidMap[c.payload.cid];
    if (c.payload?.url in updatedDagCidMap) c.payload.url = updatedDagCidMap[c.payload.url];
  });
  return manifest;
}

export type ExternalCidMap = Record<string, { size: number; path: string; directory: boolean }>;

export async function generateExternalCidMap(nodeUuid, dataBucketCid?: string) {
  // dataBucketCid matters for public nodes, if a dataBucketCid is provided, this function will generate external cids for a specific version of the node
  const externalCidMap: ExternalCidMap = {};

  const dataReferences = dataBucketCid
    ? await prisma.publicDataReference.findMany({
        where: {
          node: {
            uuid: nodeUuid.endsWith('.') ? nodeUuid : nodeUuid + '.',
          },
          rootCid: dataBucketCid,
          external: true,
        },
      })
    : await prisma.dataReference.findMany({
        where: {
          node: {
            uuid: nodeUuid.endsWith('.') ? nodeUuid : nodeUuid + '.',
          },
          external: true,
        },
      });

  dataReferences.forEach((d: DataReference) => {
    externalCidMap[d.cid] = {
      size: d.size,
      path: d.path,
      directory: d.directory,
    };
  });
  return externalCidMap;
}
