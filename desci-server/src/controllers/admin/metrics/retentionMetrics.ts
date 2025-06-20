import { Response } from 'express';

import { SuccessResponse } from '../../../core/ApiResponse.js';
import { AuthenticatedRequest } from '../../../core/types.js';
import { logger } from '../../../logger.js';
import { getFromCache, ONE_DAY_TTL, setToCache } from '../../../redisClient.js';
import { safePct } from '../../../services/admin/helper.js';
import { getUserRetention } from '../../../services/admin/interactionLog.js';
import { countAllUsers } from '../../../services/user.js';

export const getRetentionMetrics = async (_req: AuthenticatedRequest, res: Response) => {
  logger.trace({ fn: 'getRetentionMetrics' }, 'getRetentionMetrics');

  const cacheKey = 'retentionMetrics';

  // Try to get cached response with error handling
  let cachedResponse: {
    day1Retention: number;
    day7Retention: number;
    day30Retention: number;
    day365Retention: number;
  } | null = null;

  try {
    cachedResponse = await getFromCache<{
      day1Retention: number;
      day7Retention: number;
      day30Retention: number;
      day365Retention: number;
    }>(cacheKey);
  } catch (error) {
    logger.error({ error, cacheKey }, 'Failed to read from cache in getRetentionMetrics');
  }

  if (cachedResponse) {
    logger.trace({ cachedResponse }, 'getRetentionMetrics: CACHED RESPONSE');
    new SuccessResponse(cachedResponse).send(res);
    return;
  }

  const [total, day1Retention, day7Retention, day30Retention, day365Retention] = await Promise.all([
    countAllUsers(),
    getUserRetention(1),
    getUserRetention(7),
    getUserRetention(30),
    getUserRetention(365),
  ]);

  const data = {
    day1Retention: safePct(day1Retention, total),
    day7Retention: safePct(day7Retention, total),
    day30Retention: safePct(day30Retention, total),
    day365Retention: safePct(day365Retention, total),
  };

  try {
    await setToCache(cacheKey, data, ONE_DAY_TTL);
  } catch (error) {
    logger.error({ error, cacheKey }, 'Failed to write to cache in getRetentionMetrics');
  }

  new SuccessResponse(data).send(res);
};
