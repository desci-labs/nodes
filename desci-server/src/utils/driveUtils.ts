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
  ManifestActions,
  DATA_SOURCE,
} from '@desci-labs/desci-models';
import { DataReference, DataType, GuestDataReference, MigrationType, Node, PublicDataReference } from '@prisma/client';

import { prisma } from '../client.js';
import { logger } from '../logger.js';
import { getFromCache, setToCache } from '../redisClient.js';
import { DataMigrationService } from '../services/DataMigration/DataMigrationService.js';
import { DataReferenceSrc } from '../services/FileTreeService.js';
import { getDirectoryTree, type RecursiveLsResult } from '../services/ipfs.js';
import { NodeUuid } from '../services/manifestRepo.js';
import repoService from '../services/repoService.js';
import { getIndexedResearchObjects, getTimeForTxOrCommits, IndexedResearchObject } from '../theGraph.js';
import { ensureUuidEndsWithDot } from '../utils.js';

import { draftNodeTreeEntriesToFlatIpfsTree, flatTreeToHierarchicalTree } from './draftTreeUtils.js';

// NOTE: Try collapse fillDirSizes() and fillCidInfo() into one function - optimization
export function fillDirSizes(tree, cidInfoMap: Record<string, CidEntryDetails>) {
  const contains = [];
  tree.forEach((fd) => {
    const cidInfo = cidInfoMap[fd.cid];
    if (fd.type === 'dir') {
      fd.size = cidInfo?.size || 0;
      fd.contains = fillDirSizes(fd.contains, cidInfoMap);
    }
    fd.date = cidInfo?.date || Date.now();
    fd.published = cidInfo?.published;
    if (cidInfo?.dataSource) fd.dataSource = cidInfo.dataSource;
    contains.push(fd);
  });
  return contains;
}

// Fills in the access status of CIDs and dates
export function fillCidInfo(tree, cidInfoMap: Record<string, CidEntryDetails>) {
  const contains = [];
  tree.forEach((fd) => {
    if (fd.type === 'dir' && fd.contains?.length) fd.contains = fillCidInfo(fd.contains, cidInfoMap);
    const cidInfo = cidInfoMap[fd.cid];

    fd.date = cidInfo?.date || Date.now();
    fd.published = cidInfo?.published;
    if (cidInfo?.dataSource) fd.dataSource = cidInfo.dataSource;
    contains.push(fd);
  });
  return contains;
}

interface CidEntryDetails {
  size?: number;
  published?: boolean;
  date?: string;
  dataSource?: DATA_SOURCE;
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

  const nodeOwner = await prisma.user.findFirst({
    where: { id: node.ownerId },
    select: { isGuest: true, convertedGuest: true },
  });

  // If a user was previously a guest, their data may be in the process of migration.
  // We need to mark the data source for these CIDs.
  const unmigratedGuestCidsMap = nodeOwner.convertedGuest
    ? await DataMigrationService.getUnmigratedCidsMap(nodeUuid, MigrationType.GUEST_TO_PRIVATE)
    : {};

  /*
   ** Get all entries for the nodeUuid, for filling the tree
   ** Both entries neccessary to determine publish state, prioritize public entries over private
   */
  const privEntries = nodeOwner.isGuest
    ? await prisma.guestDataReference.findMany({
        select: {
          cid: true,
          size: true,
          createdAt: true,
          external: true,
        },
        where: {
          userId: ownerId,
          type: { not: DataType.MANIFEST },
          node: {
            uuid: ensureUuidEndsWithDot(nodeUuid),
          },
        },
      })
    : await prisma.dataReference.findMany({
        select: {
          cid: true,
          size: true,
          createdAt: true,
          external: true,
        },
        where: {
          userId: ownerId,
          type: { not: DataType.MANIFEST },
          node: {
            uuid: ensureUuidEndsWithDot(nodeUuid),
          },
        },
      });
  const pubEntries = await prisma.publicDataReference.findMany({
    select: {
      createdAt: true,
      size: true,
      external: true,
      cid: true,
      nodeVersion: {
        select: {
          transactionId: true,
          commitId: true,
        },
      },
    },
    where: {
      type: { not: DataType.MANIFEST },
      node: {
        uuid: ensureUuidEndsWithDot(nodeUuid),
      },
    },
  });

  const cidInfoMap: Record<string, CidEntryDetails> = {};
  if (privEntries.length | pubEntries.length) {
    const pubCids: Record<string, boolean> = {};
    pubEntries.forEach((e) => (pubCids[e.cid] = true));
    // Build cidInfoMap
    privEntries.forEach((ref) => {
      if (pubCids[ref.cid]) return; // Skip if there's a pub entry
      const entryDetails = {
        size: ref.size || 0,
        published: false,
        date: ref.createdAt?.getTime().toString(),
        external: ref.external ? true : false,
        // If a user is a guest, assume the data source for all data is GUEST.
        // If a user was a guest, but has since converted to a user, the data source for any unmigrated guest data is still GUEST.
        // Otherwise, the data source is PRIVATE.
        dataSource: nodeOwner.isGuest
          ? DATA_SOURCE.GUEST
          : unmigratedGuestCidsMap[ref.cid]
            ? DATA_SOURCE.GUEST
            : DATA_SOURCE.PRIVATE,
      };
      cidInfoMap[ref.cid] = entryDetails;
    });

    let blockTimeMap: Record<string, string> = {};

    // TODO: add back redis cache code if needed after NEVER_SYNC setting in ceramic service
    // const blockTimeMapCacheKey = `blockTimeMap-${nodeUuid}`;

    try {
      // blockTimeMap = await getFromCache(blockTimeMapCacheKey);
      if (!blockTimeMap) {
        const uniqueTxOrCommits = Array.from(
          new Set(
            pubEntries.map((entry) => entry.nodeVersion.transactionId ?? entry.nodeVersion.commitId).filter(Boolean),
          ),
        );
        blockTimeMap = await getTimeForTxOrCommits(uniqueTxOrCommits);
        // Short 5 min TTL to ease the spam when loading during anchoring, as this can take ~45 mins worst case
        // setToCache(blockTimeMapCacheKey, blockTimeMap, 60 * 5);
      }
    } catch (e) {
      logger.warn({ fn: 'getTreeAndFill', nodeUuid }, 'Failed to get blockTimeMap from redis, redis likely down');
      const uniqueTxOrCommits = Array.from(
        new Set(
          pubEntries.map((entry) => entry.nodeVersion.transactionId ?? entry.nodeVersion.commitId).filter(Boolean),
        ),
      );
      blockTimeMap = await getTimeForTxOrCommits(uniqueTxOrCommits);
    }

    pubEntries.forEach((ref) => {
      const txOrCommit = ref.nodeVersion.transactionId ?? ref.nodeVersion.commitId;
      if (!txOrCommit) {
        logger.warn({ fn: 'getTreeAndFill', ref }, 'got empty publish hashes for pubref, could be a duplicate entry');
      }

      const blockTime = blockTimeMap[txOrCommit];
      const isValidTime = blockTime !== undefined;
      const date = isValidTime ? blockTime : ref.createdAt?.getTime().toString();
      const entryDetails = {
        size: ref.size || 0,
        published: true,
        date: date,
        external: ref.external ? true : false,
        ...(unmigratedGuestCidsMap[ref.cid] && {
          dataSource: DATA_SOURCE.GUEST, // Mark cids that may still be on the GUEST node.
        }),
      };
      cidInfoMap[ref.cid] = entryDetails;
    });
  }

  tree = fillCidInfo(tree, cidInfoMap);
  const treeRoot = fillIpfsTree(manifest, tree);

  return treeRoot;
}

/**
 * @deprecated in favor of getTimeForTxOrCommits
 * Get the block time for a transaction, as a string.
 * - If a timestamp is found in the index, it's returned cached with default, long lived TTL
 * - If the research object/version is not found, returns -1 but doesn't cache it
 * - If the timestamp is missing, return -1 and caches it for a few minutes
 */
export const _getBlockTime = async (uuid: string, txOrCommit: string | undefined): Promise<string> => {
  const BLOCKTIME_NOT_FOUND = '-1';
  if (!txOrCommit) {
    return BLOCKTIME_NOT_FOUND;
  }

  let blockTime: string;
  const cacheKey = `txHash-blockTime-${txOrCommit}`;
  try {
    blockTime = await getFromCache<string>(cacheKey);
    if (blockTime) {
      return blockTime;
    }
  } catch (e) {
    // Redis isn't configured or client not ready
    logger.info({ fn: 'getBlockTime', uuid, txOrCommit }, 'Failed to get blockTime from redis');
  }

  let indexRes: { researchObjects: IndexedResearchObject[] };
  try {
    indexRes = await getIndexedResearchObjects([uuid]);
  } catch (e) {
    logger.error({ fn: 'getBlockTime', uuid, txOrCommit }, 'getIndexedResearchObjects failed');
  }

  if (!indexRes?.researchObjects?.length) {
    logger.warn({ fn: 'getBlockTime' }, `No research objects found for node ${uuid}`);
    return BLOCKTIME_NOT_FOUND;
  }

  const indexedNode = indexRes.researchObjects[0];
  const correctVersion = indexedNode.versions.find((v) => [v.id, v.commitId].includes(txOrCommit));

  if (!correctVersion) {
    logger.warn({ fn: 'getBlockTime', uuid, txOrCommit }, 'No version match was found txOrCommit');
    return BLOCKTIME_NOT_FOUND;
  }

  const timestamp = correctVersion.time;
  try {
    if (timestamp) {
      await setToCache(cacheKey, correctVersion.time);
    } else {
      await setToCache(cacheKey, BLOCKTIME_NOT_FOUND, 60 * 5); // Cache not-yet-anchored for 5 mins
    }
  } catch (e) {
    logger.warn({ fn: 'getBlockTime', uuid, txOrCommit, cacheKey }, 'Failed to set block time in cache');
  }

  return timestamp;
};

export const gbToBytes = (gb: number) => gb * 1_000_000_000;
export const bytesToGb = (bytes: number) => bytes / 1_000_000_000;

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

  // No direct types found, so try to inherit from parents
  const pathSplit = path.split('/');
  // If pathSplit.length is < 2, and a direct component doesn't exist on it, it has no parent to inherit from.
  if (pathSplit.length < 2) return DataType.UNKNOWN;
  while (pathSplit.length > 1) {
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
        cid: c.cid,
        path: c.path,
        ...(c.externalUrl && { externalUrl: c.externalUrl }),
      },
      starred: c.star || false,
    };
    manifest.components.push(comp);
  });
  return manifest;
}

export function prepareFirstNestingComponents(firstNestingComponents: FirstNestingComponent[]) {
  const preparedComponents: ResearchObjectV1Component[] = [];
  firstNestingComponents.forEach((c) => {
    const comp = {
      id: randomUUID(),
      name: c.name,
      ...(c.componentType && { type: c.componentType }),
      ...(c.componentSubtype && { subtype: c.componentSubtype }),
      payload: {
        cid: c.cid,
        path: c.path,
        ...(c.externalUrl && { externalUrl: c.externalUrl }),
      },
      starred: c.star || false,
    };
    preparedComponents.push(comp);
  });
  return preparedComponents;
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
        cid: entry.cid,
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

export type ExternalCidMap = Record<string, { size: number; path: string; directory: boolean }>;

export async function generateExternalCidMap(nodeUuid, dataBucketCid?: string) {
  // dataBucketCid matters for public nodes, if a dataBucketCid is provided, this function will generate external cids for a specific version of the node
  const externalCidMap: ExternalCidMap = {};

  const node = await prisma.node.findUnique({ where: { uuid: ensureUuidEndsWithDot(nodeUuid) } });
  const nodeOwner = await prisma.user.findFirst({ where: { id: node.ownerId }, select: { isGuest: true } });

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
    : nodeOwner.isGuest
      ? await prisma.guestDataReference.findMany({
          where: {
            node: {
              uuid: ensureUuidEndsWithDot(nodeUuid),
            },
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

  dataReferences.forEach((d: DataReference | GuestDataReference | PublicDataReference) => {
    externalCidMap[d.cid] = {
      size: d.size,
      path: d.path,
      directory: d.directory,
    };
  });
  return externalCidMap;
}
