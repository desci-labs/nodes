import { ActionType } from '@prisma/client';
import { Response } from 'express';

import { SuccessResponse } from '../../core/ApiResponse.js';
import { ValidatedRequest } from '../../core/types.js';
import { logger as parentLogger } from '../../logger.js';
import { getFromCache, setToCache, DEFAULT_TTL, delFromCache } from '../../redisClient.js';
import { DpidMetadata, getDpidMetadata } from '../../services/dpid.js';
import { saveInteraction } from '../../services/interactionLog.js';

import { retrieveDpidSchema } from './schema.js';

type RetrieveDpidMetadataRequest = ValidatedRequest<typeof retrieveDpidSchema>;

const DPID_METADATA_CACHE_PREFIX = 'dpid-metadata';
const logger = parentLogger.child({ module: 'Controllers::DPID' });

export async function retrieveDpidMetadata(req: RetrieveDpidMetadataRequest, res: Response) {
  const { dpid } = req.validatedData.params;
  const { version } = req.validatedData.query;

  // When a specific version is requested, cache it for a long time (immutable).
  // When "latest" is requested (no version), use a short TTL so new publishes
  // are reflected quickly instead of being stale for up to a week.
  const LATEST_TTL = 60 * 10; // 10 minutes
  const isLatest = !version;
  const versionSuffix = version ? `-v${version}` : '-latest';
  const cacheKey = `${DPID_METADATA_CACHE_PREFIX}-${dpid}${versionSuffix}`;

  logger.info({ dpid, version, isLatest, cacheKey }, 'Retrieving dpid metadata');

  const cachedMetadata = (await getFromCache(cacheKey)) as DpidMetadata | null;
  if (cachedMetadata) {
    logger.info(
      { dpid, version: (cachedMetadata as any).version, cacheKey, hasCover: !!cachedMetadata.coverImageUrl },
      'Cache HIT',
    );
    new SuccessResponse(cachedMetadata).send(res);
    return;
  }

  logger.info({ dpid, cacheKey }, 'Cache MISS, fetching from DB');
  const start = Date.now();
  const dpidMetadata = await getDpidMetadata(Number(dpid), version);
  const elapsed = Date.now() - start;
  logger.info(
    {
      dpid,
      resolvedVersion: (dpidMetadata as any).version,
      title: (dpidMetadata as any).title,
      hasCover: !!(dpidMetadata as any).coverImageUrl,
      elapsed,
      ttl: isLatest ? LATEST_TTL : DEFAULT_TTL,
    },
    'Fetched dpid metadata, caching',
  );
  await setToCache(cacheKey, dpidMetadata, isLatest ? LATEST_TTL : DEFAULT_TTL);

  new SuccessResponse(dpidMetadata).send(res);

  try {
    await saveInteraction({ req, action: ActionType.RETRIEVE_DPID_METADATA, data: { dpid, version } });
  } catch (err) {
    logger.error({ err, dpid, version }, 'Error saving interaction log');
  }
  return;
}
