import { neutralizePath } from '@desci-labs/desci-models';
import { DataType } from '@prisma/client';

import { prisma } from '../client.js';
import { logger as parentLogger } from '../logger.js';
import { generateTimestampMapFromDataRefs } from '../utils/dataRefTools.js';
import { TimestampMap, ipfsDagToDraftNodeTreeEntries } from '../utils/draftTreeUtils.js';
import { generateExternalCidMap } from '../utils/driveUtils.js';

import { extractRootDagCidFromManifest, getManifestFromNode } from './data/processing.js';
import { createDuplicateFileError, createMixingExternalDataError } from './data/processingErrors.js';
import { getDirectoryTree } from './ipfs.js';
import { NodeUuid } from './manifestRepo.js';
import { ensureUuidEndsWithDot } from '../utils.js';

const logger = parentLogger.child({
  module: 'Services::DraftTrees',
});

export async function migrateIpfsTreeToNodeTree(nodeUuid: string) {
  const node = await prisma.node.findUnique({ where: { uuid: nodeUuid }, include: { owner: true } });
  if (!node) {
    throw new Error(`Node with uuid ${nodeUuid} not found`);
  }

  const { manifest, manifestCid } = await getManifestFromNode(node);
  const rootDagCid = extractRootDagCidFromManifest(manifest, manifestCid);
  const externalCidMap = await generateExternalCidMap(nodeUuid);

  const ipfsTree = await getDirectoryTree(rootDagCid, externalCidMap);

  const timestampMap: TimestampMap = await generateTimestampMapFromDataRefs(node.id);

  const dbDraftTreeEntries = await ipfsDagToDraftNodeTreeEntries({ ipfsTree, node, user: node.owner, timestampMap });

  await prisma.draftNodeTree.createMany({
    data: dbDraftTreeEntries,
    skipDuplicates: true,
  });

  // Adjust existing private data references to use neutral paths
  const currentPrivateDataRefs = await prisma.dataReference.findMany({
    where: { nodeId: node.id, type: { not: DataType.MANIFEST } },
  });
  const updatesForPrivateDataRefs = currentPrivateDataRefs.map((ref) =>
    prisma.dataReference.update({
      where: {
        id: ref.id,
      },
      data: {
        path: neutralizePath(ref.path),
      },
    }),
  );
  try {
    await prisma.$transaction(updatesForPrivateDataRefs);
    logger.info(`Private data refs updated successfully for node ${nodeUuid}`);
  } catch (error) {
    logger.error({ error }, `Failed to update private data refs for node ${nodeUuid}`);
  }

  logger.info(`Migrated IPFS tree to DraftNodeTree for node ${nodeUuid}`);
}

export async function externalDirCheck(nodeId: number, path: string): Promise<boolean> {
  const contextDraftTreeNode = await prisma.draftNodeTree.findFirst({
    where: { nodeId, path },
  });
  if (contextDraftTreeNode?.external) throw createMixingExternalDataError();
  return false;
}

export interface EnsureUniquePathsDraftTreeParams {
  nodeId: number;
  contextPath: string;
  filesBeingAdded?: any[];
  externalUrlFilePaths?: string[];
}

export async function ensureUniquePathsDraftTree({
  contextPath,
  filesBeingAdded,
  externalUrlFilePaths,
  nodeId,
}: EnsureUniquePathsDraftTreeParams): Promise<boolean> {
  // Ensure all paths being added are unique to prevent collisions
  // debugger;
  let newPathsFormatted: string[] = [];
  const header = contextPath;
  if (filesBeingAdded?.length) {
    newPathsFormatted = filesBeingAdded.map((f) => {
      if (f.originalname[0] !== '/') f.originalname = '/' + f.originalname;
      return header + f.originalname;
    });
  }
  if (externalUrlFilePaths) {
    if (externalUrlFilePaths?.length > 0) {
      newPathsFormatted = externalUrlFilePaths.map((filePath) => {
        return header + '/' + filePath;
      });
    }
  }

  const matches = await prisma.draftNodeTree.findMany({
    where: {
      nodeId,
      path: {
        in: newPathsFormatted,
      },
    },
  });

  const hasDuplicates = matches.length;
  if (hasDuplicates) {
    logger.info('[UPDATE DATASET] Rejected as duplicate paths were found');
    throw createDuplicateFileError();
  }
  return true;
}

export async function getDraftTreeEntriesByUuid(uuid: NodeUuid) {
  const node = await prisma.node.findFirst({ where: { uuid: ensureUuidEndsWithDot(uuid) } });

  const treeEntries = await prisma.draftNodeTree.findMany({
    where: {
      nodeId: node.id,
    },
  });

  return treeEntries;
}

export async function getLatestDriveTime(nodeUuid: NodeUuid) {
  const node = await prisma.node.findFirst({
    where: {
      uuid: nodeUuid,
    },
  });

  const latestDriveTime = await prisma.draftNodeTree.findFirst({
    where: {
      nodeId: node.id,
    },
    orderBy: {
      updatedAt: 'desc',
    },
  });

  return latestDriveTime?.updatedAt.getTime().toString() ?? new Date().getTime().toString();
}
