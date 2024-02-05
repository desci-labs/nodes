import { randomUUID } from 'crypto';

import { DocumentId } from '@automerge/automerge-repo';
import {
  DEFAULT_COMPONENT_TYPE,
  DrivePath,
  FileExtension,
  ResearchObjectComponentSubtypes,
  ResearchObjectComponentType,
  ResearchObjectComponentTypeMap,
  ResearchObjectV1,
  ResearchObjectV1Component,
  extractExtension,
  fillIpfsTree,
  isNodeRoot,
  isResearchObjectComponentTypeMap,
} from '@desci-labs/desci-models';
import { DataReference, DataType, Node } from '@prisma/client';

import { prisma } from '../client.js';
import { DataReferenceSrc } from '../controllers/data/retrieve.js';
import { logger } from '../logger.js';
import { getOrCache } from '../redisClient.js';
import { getDirectoryTree, type RecursiveLsResult } from '../services/ipfs.js';
import { ManifestActions, NodeUuid } from '../services/manifestRepo.js';
import repoService from '../services/repoService.js';
import { getIndexedResearchObjects } from '../theGraph.js';

import { draftNodeTreeEntriesToFlatIpfsTree, flatTreeToHierarchicalTree } from './draftTreeUtils.js';
import { ensureUuidEndsWithDot } from '../utils.js';

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
  const externalCidMap = await generateExternalCidMap(ensureUuidEndsWithDot(nodeUuid));
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
              uuid: ensureUuidEndsWithDot(nodeUuid),
            },
          },
        })
      : await prisma.publicDataReference.findMany({
          where: {
            type: { not: DataType.MANIFEST },
            // cid: { in: dirCids },
            // rootCid: rootCid,
            node: {
              uuid: ensureUuidEndsWithDot(nodeUuid),
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
              uuid: ensureUuidEndsWithDot(nodeUuid),
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
  let dataBucket = manifest.components.find((c) => isNodeRoot(c));
  if (!dataBucket) {
    dataBucket = {
      payload: { cid: 'draft' },
      id: 'bucket-placeholder',
      name: 'draft-placeholder',
      type: ResearchObjectComponentType.DATA_BUCKET,
    };
    logger.warn({ nodeUuid, ownerId }, "Couldn't find data bucket in manifest, using placeholder");
  }
  const rootCid = dataBucket.payload.cid;
  const externalCidMap = published
    ? await generateExternalCidMap(ensureUuidEndsWithDot(nodeUuid), rootCid)
    : await generateExternalCidMap(ensureUuidEndsWithDot(nodeUuid));

  const node = await prisma.node.findUnique({ where: { uuid: ensureUuidEndsWithDot(nodeUuid) } });

  const dbTree = await prisma.draftNodeTree.findMany({ where: { nodeId: node.id } });
  let tree: RecursiveLsResult[] = published
    ? await getDirectoryTree(rootCid, externalCidMap)
    : flatTreeToHierarchicalTree(await draftNodeTreeEntriesToFlatIpfsTree(dbTree));
  logger.info('ran getTreeAndFill');
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
        uuid: ensureUuidEndsWithDot(nodeUuid),
      },
    },
  });
  const pubEntries = await prisma.publicDataReference.findMany({
    where: {
      type: { not: DataType.MANIFEST },
      node: {
        uuid: ensureUuidEndsWithDot(nodeUuid),
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
  const treeRoot = fillIpfsTree(manifest, tree);

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
  // if (isNodeRoot(component)) return ROTypesToPrismaTypes[ResearchObjectComponentType.DATA_BUCKET];
  return isResearchObjectComponentTypeMap(component.type)
    ? componentTypeMapToDbComponentTypeMap(component.type)
    : ROTypesToPrismaTypes[component.type];
}

function componentTypeMapToDbComponentTypeMap(componentTypeMap: ResearchObjectComponentTypeMap) {
  const dbTypeMap: Record<FileExtension, DataType> = {};
  Object.keys(componentTypeMap).forEach((ext) => {
    dbTypeMap[ext as FileExtension] = ROTypesToPrismaTypes[componentTypeMap[ext as FileExtension]];
  });
  return dbTypeMap;
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
  // manifestPathsToTypes[DRIVE_NODE_ROOT_PATH] = DataType.DATA_BUCKET;
  return manifestPathsToTypes;
}

/**
 * Inherits component types from the most specific node/parent
 * NOTE: Used for DB DataType, not ResearchObjectComponentType!
 */
export function inheritComponentType(path, pathToDbTypeMap: Record<string, DataType | ExtensionDataTypeMap>): DataType {
  if (path === DRIVE_NODE_ROOT_PATH) return DataType.DATA_BUCKET;

  // Check if path has a direct type on it, meaning a component exists for that path
  const directType = pathToDbTypeMap[path];
  if (directType) {
    // The direct type is either a component type map or a type
    if (isResearchObjectComponentTypeMap(directType)) {
      // If it is a component type map, return it as as the default component type (Data), as a component type map isn't a valid DB type.
      return ROTypesToPrismaTypes[DEFAULT_COMPONENT_TYPE];
    } else {
      // It's a regular type, return it.
      return directType as DataType;
    }
  }

  // debugger;
  // No direct types found, so try to inherit from parents
  const pathSplit = path.split('/');
  // If pathSplit.length is < 2, and a direct component doesn't exist on it, it has no parent to inherit from.
  if (pathSplit.length < 2) return DataType.UNKNOWN;
  while (pathSplit.length > 1) {
    // debugger;
    pathSplit.pop();

    const parentPath = pathSplit.join('/');
    const parentType = pathToDbTypeMap[parentPath];
    if (parentType) {
      // A parent with a type exists, it's either a type or a component type map.
      if (isResearchObjectComponentTypeMap(parentType)) {
        const extension = extractExtension(path);
        if (extension && parentType[extension]) {
          // A match on the extension was found inside the parents component type map, return it.
          return (parentType as ExtensionDataTypeMap)[extension] as DataType;
        } else {
          // A component type map exists, but it doesn't contain the extension, return the default component type (Data).
          return ROTypesToPrismaTypes[DEFAULT_COMPONENT_TYPE];
        }
      } else {
        // The parent has a regular type, return it.
        return parentType as DataType;
      }
    }
  }
  // Inheritance failed to find a type, return default.
  // return DataType.UNKNOWN;
  return ROTypesToPrismaTypes[DEFAULT_COMPONENT_TYPE];
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

/**
 * This function is used to manually update the manifest document by mutating it in playce
 * @param manifest ResearchObjectV1
 * @param firstNestingComponents array of components to add to manifest
 * @returns updated manifest object with newly added components
 */
export function DANGEROUSLY_addComponentsToManifest(
  manifest: ResearchObjectV1,
  firstNestingComponents: FirstNestingComponent[],
) {
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

export async function addComponentsToDraftManifest(node: Node, firstNestingComponents: FirstNestingComponent[]) {
  //add duplicate path check
  const components = firstNestingComponents.map((entry) => {
    return {
      id: randomUUID(),
      name: entry.name,
      ...(entry.componentType && { type: entry.componentType }),
      ...(entry.componentSubtype && { subtype: entry.componentSubtype }),
      payload: {
        ...urlOrCid(entry.cid, entry.componentType),
        path: entry.path,
        ...(entry.externalUrl && { externalUrl: entry.externalUrl }),
      },
      starred: entry.star || false,
    };
  });

  const actions: ManifestActions[] = [{ type: 'Add Components', components }];
  try {
    // updatedManifest = await manifestUpdater({ type: 'Add Components', components });
    logger.info({ uuid: node.uuid, actions }, '[AddComponentsToDraftManifest]');
    const response = await repoService.dispatchAction({
      uuid: node.uuid as NodeUuid,
      documentId: node.manifestDocumentId as DocumentId,
      actions,
    });
    logger.info({ actions, response }, '[AddComponentsToDraftManifest]');
    return response?.manifest;
  } catch (err) {
    logger.error({ err, actions }, '[ERROR addComponentsToDraftManifest]');
    return null;
  }
}

export type oldCid = string;
export type newCid = string;
// export function updateManifestComponentDagCids(manifest: ResearchObjectV1, updatedDagCidMap: Record<oldCid, newCid>) {
//   manifest.components.forEach((c) => {
//     if (c.payload?.cid in updatedDagCidMap) c.payload.cid = updatedDagCidMap[c.payload.cid];
//     if (c.payload?.url in updatedDagCidMap) c.payload.url = updatedDagCidMap[c.payload.url];
//   });
//   return manifest;
// }

export type ExternalCidMap = Record<string, { size: number; path: string; directory: boolean }>;

export async function generateExternalCidMap(nodeUuid, dataBucketCid?: string) {
  // dataBucketCid matters for public nodes, if a dataBucketCid is provided, this function will generate external cids for a specific version of the node
  const externalCidMap: ExternalCidMap = {};

  const dataReferences = dataBucketCid
    ? await prisma.publicDataReference.findMany({
        where: {
          node: {
            uuid: ensureUuidEndsWithDot(nodeUuid),
          },
          rootCid: dataBucketCid,
          external: true,
        },
      })
    : await prisma.dataReference.findMany({
        where: {
          node: {
            uuid: ensureUuidEndsWithDot(nodeUuid),
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
