import { DraftNodeTree, Prisma } from '@prisma/client';

import prisma from 'client';
import parentLogger from 'logger';
import { ipfsDagToDraftNodeTreeEntries } from 'utils/draftTreeUtils';
import { generateExternalCidMap } from 'utils/driveUtils';

import { extractRootDagCidFromManifest, getManifestFromNode } from './data/processing';
import { createDuplicateFileError, createMixingExternalDataError } from './data/processingErrors';
import { getDirectoryTree } from './ipfs';

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

  const dbDraftTreeEntries = await ipfsDagToDraftNodeTreeEntries(ipfsTree, node, node.owner);

  await prisma.draftNodeTree.createMany({
    data: dbDraftTreeEntries,
    skipDuplicates: true,
  });
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
}: EnsureUniquePathsDraftTreeParams): Promise<boolean> {
  // Ensure all baths being added are unique to prevent collisions

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
