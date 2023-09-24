import { ResearchObjectComponentType } from '@desci-labs/desci-models';
import axios from 'axios';
import Redis from 'ioredis';

import { cleanupManifestUrl } from 'controllers/nodes';
import parentLogger from 'logger';
import redisClient from 'redisClient';
import { getIndexedResearchObjects } from 'theGraph';
import { hexToCid } from 'utils';

const logger = parentLogger.child({ module: 'SCRIPTS::invalidateRedisKeys' });
/* 

Usage Examples:
invalidateByUuid:     OPERATION=invalidateByUuid NODE_UUID=noDeUuiD. npm run script:invalidate-redis-cache

*/

main();
function main() {
  const { operation, nodeUuid } = getOperationEnvs();

  switch (operation) {
    case 'invalidateByUuid':
      if (!nodeUuid) return logger.error('Missing NODE_UUID or MANIFEST_CID');
      invalidateByUuid({ nodeUuid });
      break;
    default:
      logger.error('Invalid operation, valid operations include: invalidateByUuid');
      return;
  }
}

function getOperationEnvs() {
  return {
    operation: process.env.OPERATION || null,
    nodeUuid: process.env.NODE_UUID || null,
  };
}

async function invalidateByUuid({ nodeUuid }: { nodeUuid: string }) {
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
      const dataBucketCid = manifest.components.find((c) => c.type === ResearchObjectComponentType.DATA_BUCKET)?.payload
        .cid;

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
  if (redisClient instanceof Redis.Cluster) {
    const keys = await redisClient.keys(pattern);
    if (keys.length > 0) {
      await Promise.all(keys.map((key) => redisClient.del(key)));
    }
  } else {
    let cursor = 0;
    do {
      const res = await redisClient.scan(cursor, 'MATCH', pattern, 'COUNT', 500);
      cursor = parseInt(res[0], 10);
      const keys = res[1];
      if (keys.length > 0) {
        await Promise.all(keys.map((key) => redisClient.del(key)));
      }
    } while (cursor !== 0);
  }
  logger.info({ pattern }, `All matching keys deleted.`);
}
