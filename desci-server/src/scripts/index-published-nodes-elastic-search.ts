/*
 * Indexing job for backfilling published nodes onto elastic search
 */

import { prisma } from '../client.js';
import { logger as parentLogger } from '../logger.js';
import { ElasticNodesService } from '../services/ElasticNodesService.js';

const logger = parentLogger.child({ module: 'SCRIPTS::IndexPublishedNodesES' });

async function main() {
  logger.info('[ES Native Node Backfill] Script starting');
  const publishedNodes = await prisma.nodeVersion.findMany({
    where: {
      OR: [{ transactionId: { not: null } }, { commitId: { not: null } }],
      nodeId: { not: null },
    },
    select: {
      nodeId: true,
    },
    distinct: ['nodeId'],
  });

  const publishedNodeIds = publishedNodes.map((node) => node.nodeId);

  const nodeUuids = await prisma.node.findMany({
    where: {
      id: { in: publishedNodeIds },
    },
    select: {
      id: true,
      uuid: true,
    },
  });

  logger.info(`[ES Native Node Backfill] Found ${nodeUuids.length} published nodes`);

  debugger;

  process.exit(0);
}

main();
