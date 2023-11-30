import prisma from 'client';
import parentLogger from 'logger';
import { migrateIpfsTreeToNodeTree } from 'services/draftTrees';
import { client, getDirectoryTree } from 'services/ipfs';
import { draftNodeTreeEntriesToFlatIpfsTree } from 'utils/draftTreeUtils';
import { generateExternalCidMap } from 'utils/driveUtils';

const logger = parentLogger.child({ module: 'SCRIPTS::Testing' });

const rootCid = '';
const nodeUuid = '.';

async function benchmark() {
  const extCidMap = await generateExternalCidMap(nodeUuid, rootCid);

  await getDirectoryTree(rootCid, extCidMap);

  const node = await prisma.node.findUnique({ where: { uuid: nodeUuid } });

  const startTime = process.hrtime();
  const tree = await prisma.draftNodeTree.findMany({ where: { nodeId: node.id } });
  await draftNodeTreeEntriesToFlatIpfsTree(tree);
  const endTime = process.hrtime(startTime);
  logger.error(`DB Execution time: ${endTime[0]}s ${endTime[1] / 1000000}ms`);
}

// migrateIpfsTreeToNodeTree(nodeUuid);
benchmark();
