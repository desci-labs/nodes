import { NextFunction, Request, Response } from 'express';
import _ from 'lodash';

import { SuccessResponse, attestationService, logger } from '../../internal.js';

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
  const { communityId } = req.params;
  let attestations = await attestationService.listCommunityAttestations(parseInt(communityId));
  attestations = attestations.sort((c1, c2) => {
    const key1 = c1.verifications + c1.annotations + c1.reactions;
    const key2 = c2.verifications + c2.annotations + c2.reactions;
    return key2 - key1;
  });
  logger.info({ attestations: attestations.length }, 'GetCommunityRecommendations');
  return new SuccessResponse(attestations).send(res);
};
