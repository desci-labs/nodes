/*
 * Indexing job for backfilling published nodes onto elastic search
 */

import fs from 'fs/promises';

import { prisma } from '../client.js';
import { logger as parentLogger } from '../logger.js';
import { ElasticNodesService } from '../services/ElasticNodesService.js';
const logger = parentLogger.child({ module: 'SCRIPTS::IndexPublishedNodesES' });

async function main() {
  logger.info('[ES Native Node Backfill] Script starting');
  const { start, end } = getScriptEnvs();
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

  const slicedNodeUuids = nodeUuids.slice(start, end ? end + 1 : undefined);

  logger.info(
    { start, end },
    `[ES Native Node Backfill] Found ${nodeUuids.length} published nodes, selected ${slicedNodeUuids.length} published nodes.`,
  );
  if (start || end) {
    logger.info(
      { start, end, firstNodeId: slicedNodeUuids[0].id, lastNodeId: slicedNodeUuids[slicedNodeUuids.length - 1].id },
      `[ES Native Node Backfill] START and END are set, will only index nodes between ${start} and ${end}`,
    );
  }

  const failures = [];

  let i = 0;
  for (const { id, uuid } of slicedNodeUuids) {
    logger.info({ uuid, nodeId: id }, `[ES Native Node Backfill] Indexing node ${i}/${nodeUuids.length}`);
    const result = await ElasticNodesService.indexResearchObject(uuid);
    if ('success' in result && !result.success) {
      logger.error({ uuid, nodeId: id, error: result.error }, 'Error indexing node');
      failures.push(result);
    }
    logger.info({ uuid, nodeId: id }, `[ES Native Node Backfill] Completed indexing node ${i}/${nodeUuids.length}`);
    i++;
  }

  if (failures.length > 0) {
    logger.error({ failures }, `[ES Native Node Backfill] ${failures.length} Failures during ES indexing`);
    const failuresPath = './es-indexing-failures.json';
    await fs.writeFile(failuresPath, JSON.stringify(failures, null, 2));
    logger.info(`[ES Native Node Backfill] Saved failures to ${failuresPath}`);
  }
  logger.info(`[ES Native Node Backfill] ${failures.length} failures during indexing`);

  logger.info('[ES Native Node Backfill] Script finished executing');
  process.exit(0);
}

function getScriptEnvs() {
  const start = process.env.START ? Number(process.env.START) : undefined;
  const end = process.env.END ? Number(process.env.END) : undefined;

  if (start !== undefined && isNaN(start)) {
    throw new Error('START must be a valid number');
  }

  if (end !== undefined && isNaN(end)) {
    throw new Error('END must be a valid number');
  }

  if (start !== undefined && end !== undefined && start > end) {
    throw new Error('START cannot be greater than END');
  }

  return { start, end };
}

main();
