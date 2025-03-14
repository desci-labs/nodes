/*
 * Script to preload the AI API data for all nodes
 */

import fs from 'fs/promises';

import { Node } from '@prisma/client';

import { prisma } from '../client.js';
import { logger as parentLogger } from '../logger.js';
import { ElasticNodesService } from '../services/ElasticNodesService.js';
import { getLatestManifestFromNode } from '../services/manifestRepo.js';
import { getFirstManuscript } from '../utils/manifest.js';
const logger = parentLogger.child({ module: 'SCRIPTS::Preload AI API' });

async function main() {
  logger.info('[Preload AI API] Script starting');
  const { start, end, batchSize } = getScriptEnvs();
  const skip = start ?? 0;
  const take = end ? end - skip : undefined;
  const nodes = await prisma.node.findMany({
    ...(skip && { skip }),
    ...(take && { take }),
  });

  logger.info(
    { start, end, batchSize },
    `[Preload AI API] Processing ${nodes.length} nodes in batches of ${batchSize}`,
  );
  if (start || end) {
    logger.info(
      { start, end, firstNodeId: nodes?.[0].id, lastNodeId: nodes[nodes?.length - 1].id },
      `[Preload AI API] START and END are set, will only process nodes between ${start} and ${end}`,
    );
  }

  const failures = [];

  // Process nodes in batches
  for (let i = 0; i < nodes.length; i += batchSize) {
    const batch = nodes.slice(i, i + batchSize);
    const promises = batch.map(async (node, batchIndex) => {
      const { id, uuid } = node;
      const nodeIndex = i + batchIndex + 1;
      logger.info({ uuid, nodeId: id }, `[Preload AI API] Processing node ${nodeIndex}/${nodes.length}`);
      try {
        const result = await preloadAiData(node);
        if (!result) {
          //   debugger;
          logger.error({ uuid, nodeId: id }, 'Error preloading AI data for node');
          failures.push({ uuid, nodeId: id });
        }
        logger.info({ uuid, nodeId: id }, `[Preload AI API] Completed processing node ${nodeIndex}/${nodes.length}`);
      } catch (e) {
        // debugger;
        logger.error(
          { uuid, nodeId: id, node: `${nodeIndex}/${nodes.length}`, error: e },
          'Error preloading AI data for node',
        );
        failures.push({ uuid, nodeId: id, error: e });
      }
    });
    await Promise.allSettled(promises);
  }

  if (failures.length > 0) {
    logger.error({ failures }, `[Preload AI API] ${failures.length} Failures during AI preloading`);
    const failuresPath = './preload-ai-failures.json';
    await fs.writeFile(failuresPath, JSON.stringify(failures, null, 2));
    logger.info(`[Preload AI API] Saved failures to ${failuresPath}`);
  }
  logger.info(`[Preload AI API] ${failures.length} failures during AI preloading`);

  logger.info('[Preload AI API] Script finished executing');
  process.exit(0);
}

function getScriptEnvs() {
  const start = process.env.START ? Number(process.env.START) : undefined;
  const end = process.env.END ? Number(process.env.END) : undefined;
  const batchSize = process.env.BATCH_SIZE ? Number(process.env.BATCH_SIZE) : 5;

  if (start !== undefined && isNaN(start)) {
    throw new Error('START must be a valid number');
  }

  if (end !== undefined && isNaN(end)) {
    throw new Error('END must be a valid number');
  }

  if (start !== undefined && end !== undefined && start > end) {
    throw new Error('START cannot be greater than END');
  }

  if (isNaN(batchSize) || batchSize < 1) {
    throw new Error('BATCH_SIZE must be a positive number');
  }

  return { start, end, batchSize };
}

async function preloadAiData(node: Node) {
  const manifest = await getLatestManifestFromNode(node);
  const firstManuscript = getFirstManuscript(manifest);
  if (!firstManuscript) {
    logger.error({ nodeId: node.id, uuid: node.uuid }, 'No manuscript found in manifest');
    throw new Error('No manuscript found in manifest');
  }
  const manuscriptCid = firstManuscript.payload?.cid || firstManuscript.payload?.url;
  if (!manuscriptCid) {
    logger.error({ nodeId: node.id, uuid: node.uuid }, 'No manuscript CID found in manifest');
    throw new Error('No manuscript CID found in manifest');
  }

  const aiData = await ElasticNodesService.getAiData(manifest, true);
  // At this point on successful retrieval, the AI data is cached on the AI server using the CID as the cache key
  if (!aiData) {
    logger.error({ nodeId: node.id, uuid: node.uuid, manuscriptCid }, 'Failed getting AI data for manuscript');
    throw new Error('Failed getting AI data for manuscript');
  } else {
    logger.info({ nodeId: node.id, uuid: node.uuid, manuscriptCid }, 'Successfully preloaded AI data for manuscript');
  }
  return true;
  // We can go about making mutations here to the manifest, without the mutations the data is already cached with a long TTL,
  //  so loading should be fast on the frontend.
  //   const { topics, concepts: keywords } = aiData;
}

main();
