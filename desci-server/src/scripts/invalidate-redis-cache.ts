import { isNodeRoot } from '@desci-labs/desci-models';
import axios from 'axios';

import { logger as parentLogger } from '../logger.js';
import { redisClient } from '../redisClient.js';
import { getIndexedResearchObjects } from '../theGraph.js';
import { cleanupManifestUrl } from '../utils/manifest.js';
import { hexToCid } from '../utils.js';

const logger = parentLogger.child({ module: 'SCRIPTS::invalidateRedisKeys' });
/*

Usage Examples:
invalidateByUuid:     OPERATION=invalidateByUuid NODE_UUID=noDeUuiD. npm run script:invalidate-redis-cache

*/
async function main() {
  try {
    const { operation, nodeUuid } = getOperationEnvs();

    switch (operation) {
      case 'invalidateByUuid':
        if (!nodeUuid) return logger.error('Missing NODE_UUID or MANIFEST_CID');
        await invalidateByUuid({ nodeUuid });
        break;
      case 'invalidateAll':
        if (nodeUuid) {
          logger.error('NODE_UUID was passed to invalidateAll, aborting in case of mistake');
          throw new Error('invalidateAll does not take NODE_UUID');
        }
        await invalidateAll();
        break;
      default:
        logger.error('Invalid operation, valid operations include: invalidateByUuid');
        return;
    }
  } catch (e) {
    const err = e as Error;
    console.error('Script failed:', err.message);
    process.exit(1);
  } finally {
    await redisClient.quit();
  }
}

function getOperationEnvs() {
  return {
    operation: process.env.OPERATION || null,
    nodeUuid: process.env.NODE_UUID || null,
  };
}

async function invalidateAll() {
  await redisClient.flushDb();
  logger.info('[invalidateAll] Wiped all keys from cache');
}

export async function invalidateByUuid({ nodeUuid }: { nodeUuid: string }) {
  // Find all published versions of the node
  if (!nodeUuid.endsWith('.')) nodeUuid += '.';
  const { researchObjects } = await getIndexedResearchObjects([nodeUuid]);
  if (!researchObjects.length)
    logger.error(`[FillPublic] Failed to resolve any public nodes with the uuid: ${nodeUuid}`);

  // Find every manifest CID and root CID for each node, and iterate a deleteKey run over each
  const indexedNode = researchObjects[0];

  const totalVersionsIndexed = indexedNode.versions.length || 0;
  try {
    for (let nodeVersIdx = 0; nodeVersIdx < totalVersionsIndexed; nodeVersIdx++) {
      logger.info(
        `[invalidateByUuid] Deleting keys for indexed version: ${nodeVersIdx}, with txHash: ${indexedNode.versions[nodeVersIdx]?.id}`,
      );
      const hexCid = indexedNode.versions[nodeVersIdx]?.cid || indexedNode.recentCid;
      const manifestCid = hexToCid(hexCid);
      const manifestUrl = cleanupManifestUrl(manifestCid);
      const manifest = await (await axios.get(manifestUrl)).data;
      if (!manifest)
        return logger.error(
          { manifestUrl, manifestCid },
          `[invalidateByUuid] Failed to retrieve manifest from ipfs cid: ${manifestCid}`,
        );
      const dataBucketCid = manifest.components.find((c) => isNodeRoot(c))?.payload.cid;

      await deleteKeys(`*${manifestCid}*`);
      await deleteKeys(`*${dataBucketCid}*`);
    }
  } catch (e) {
    logger.error(
      {
        err: e,
        nodeUuid,
        totalVersionsIndexed,
        indexedNode,
      },
      `[invalidateByUuid] Failed to invalidate cache keys for node: ${nodeUuid}, error`,
    );
  }
}

async function deleteKeys(pattern: string) {
  let cursor = 0;

  do {
    // Scan the Redis keyspace
    const res = await redisClient.scan(cursor, { MATCH: pattern as string, COUNT: 500 });
    cursor = res.cursor || 0;
    const keys = res.keys || [];

    // Delete the keys
    if (keys?.length > 0) {
      logger.info({ keys }, `Found ${keys.length} keys, deleting...`);
      await Promise.all(keys.map(async (key) => await redisClient.del(key)));
    }
  } while (cursor !== 0);

  logger.info({ pattern }, `All matching keys deleted.`);
}

const runAsScript =
  process.argv[0].includes('/bin/node') && process.argv[1].includes('scripts/invalidate-redis-cache.ts');
console.log(process.argv);

if (runAsScript) {
  main();
}
