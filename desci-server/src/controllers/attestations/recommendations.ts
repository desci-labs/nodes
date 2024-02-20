import { NextFunction, Request, Response } from 'express';
import _ from 'lodash';

import {
  NotFoundError,
  SuccessResponse,
  attestationService,
  communityService,
  logger as parentLogger,
} from '../../internal.js';

const logger = parentLogger.child({ module: 'Recommendations' });

export const getAllRecommendations = async (_req: Request, res: Response, _next: NextFunction) => {
  let attestations = await attestationService.listAll();
  attestations = attestations.sort((c1, c2) => {
    const key1 = c1.verifications + c1.annotations + c1.reactions;
    const key2 = c2.verifications + c2.annotations + c2.reactions;
    return key2 - key1;
  });
  return new SuccessResponse(attestations).send(res);
};

export const getCommunityRecommendations = async (req: Request, res: Response, _next: NextFunction) => {
  const { communityName } = req.params;
  logger.info({ communityName });
  const community = await communityService.findCommunityByNameOrSlug(communityName);
  if (!community) throw new NotFoundError('Community not found');
  logger.info({ community });

  let attestations = await attestationService.listCommunityAttestations(community.id);
  attestations = attestations.sort((c1, c2) => {
    const key1 = c1.verifications + c1.annotations + c1.reactions;
    const key2 = c2.verifications + c2.annotations + c2.reactions;
    return key2 - key1;
  });

  logger.info({ attestations: attestations.length, communityName }, 'GetCommunityRecommendations');
  return new SuccessResponse(attestations).send(res);
};
