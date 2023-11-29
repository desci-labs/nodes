import { DraftNodeTree, Prisma } from '@prisma/client';

import prisma from 'client';
import parentLogger from 'logger';
import { ipfsDagToDraftNodeTreeEntries } from 'utils/draftTreeUtils';
import { generateExternalCidMap } from 'utils/driveUtils';

import { extractRootDagCidFromManifest, getManifestFromNode } from './data/processing';
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
