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

  const versionSuffix = version ? `-v${version}` : '';
  const cacheKey = `${DPID_METADATA_CACHE_PREFIX}-${dpid}${versionSuffix}`;

  const cachedMetadata = (await getFromCache(cacheKey)) as DpidMetadata | null;
  if (cachedMetadata) {
    new SuccessResponse(cachedMetadata).send(res);
    return;
  }

  const dpidMetadata = await getDpidMetadata(Number(dpid), version);
  await setToCache(cacheKey, dpidMetadata, DEFAULT_TTL);

  new SuccessResponse(dpidMetadata).send(res);

  try {
    await saveInteraction({ req, action: ActionType.RETRIEVE_DPID_METADATA, data: { dpid, version } });
  } catch (err) {
    logger.error({ err, dpid, version }, 'Error saving interaction log');
  }
  return;
}
