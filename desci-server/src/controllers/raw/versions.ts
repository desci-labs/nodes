import { Request, Response, NextFunction } from 'express';

import { logger as parentLogger } from '../../logger.js';
import { getIndexedResearchObjects } from '../../theGraph.js';
import { getOrCache, ONE_DAY_TTL } from '../../redisClient.js';
import { ensureUuidEndsWithDot } from '../../utils.js';

const logger = parentLogger.child({
  module: 'RAW::versionsController',
});

/**
 * Get all versions of research object from index (publicView).
 * Cached in Redis for 1 day — the dpid.org /api/v2/query/history
 * endpoint takes 5-8 seconds uncached.
 */
export const versions = async (req: Request, res: Response, next: NextFunction) => {
  const uuid = ensureUuidEndsWithDot(req.params.uuid);
  const cacheKey = `indexed-versions-${uuid}`;

  try {
    const result = await getOrCache(
      cacheKey,
      async () => {
        const { researchObjects } = await getIndexedResearchObjects([uuid]);
        return researchObjects[0] ?? null;
      },
      ONE_DAY_TTL,
    );

    if (!result) {
      logger.warn({ uuid }, 'could not find indexed versions');
      res.status(404).send({ ok: false, msg: `could not locate uuid ${uuid}` });
      return;
    }

    res.send(result);
  } catch (err) {
    logger.error({ uuid, err }, `[ERROR] versions lookup fail ${err.message}`);
    res.status(500).send({ ok: false, msg: 'Failed to fetch versions' });
  }
};
