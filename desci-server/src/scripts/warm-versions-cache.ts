/**
 * Pre-warm the Redis cache for /v1/pub/versions responses.
 *
 * Queries all published nodes from the DB, then calls getIndexedResearchObjects
 * for each one, which populates the `indexed-versions-{uuid}` cache key.
 *
 * Usage:
 *   npx ts-node src/scripts/warm-versions-cache.ts
 *   # or with concurrency limit:
 *   CONCURRENCY=5 npx ts-node src/scripts/warm-versions-cache.ts
 */
import { prisma } from '../client.js';
import { getIndexedResearchObjects } from '../theGraph.js';
import { getOrCache, ONE_DAY_TTL } from '../redisClient.js';
import { ensureUuidEndsWithDot } from '../utils.js';

const CONCURRENCY = parseInt(process.env.CONCURRENCY || '3', 10);

async function main() {
  console.log('Fetching all published nodes with dpidAlias...');

  const nodes = await prisma.node.findMany({
    select: { uuid: true, dpidAlias: true },
    where: {
      dpidAlias: { not: null },
      isDeleted: false,
    },
    orderBy: { dpidAlias: 'desc' },
  });

  console.log(`Found ${nodes.length} published nodes. Warming cache with concurrency=${CONCURRENCY}...`);

  let warmed = 0;
  let failed = 0;

  for (let i = 0; i < nodes.length; i += CONCURRENCY) {
    const batch = nodes.slice(i, i + CONCURRENCY);

    await Promise.allSettled(
      batch.map(async (node) => {
        const uuid = ensureUuidEndsWithDot(node.uuid);
        const cacheKey = `indexed-versions-${uuid}`;

        try {
          await getOrCache(
            cacheKey,
            async () => {
              const { researchObjects } = await getIndexedResearchObjects([uuid]);
              return researchObjects[0] ?? null;
            },
            ONE_DAY_TTL,
          );
          warmed++;
          if (warmed % 10 === 0) {
            console.log(`  Progress: ${warmed}/${nodes.length} warmed, ${failed} failed`);
          }
        } catch (e) {
          failed++;
          console.error(`  Failed dpid=${node.dpidAlias} uuid=${uuid}: ${(e as Error).message}`);
        }
      }),
    );
  }

  console.log(`\nDone. Warmed: ${warmed}, Failed: ${failed}, Total: ${nodes.length}`);
  process.exit(0);
}

main().catch((e) => {
  console.error('Fatal error:', e);
  process.exit(1);
});
