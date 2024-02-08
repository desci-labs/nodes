import { NextFunction, Request, Response } from 'express';
import _ from 'lodash';

import { SuccessResponse, attestationService, logger } from '../../internal.js';

export const getAllRecommendations = async (_req: Request, res: Response, _next: NextFunction) => {
  console.log('getAllRecommendations', { bb: _req.body, q: _req.query, _p: _req.params });
  const attestations = await attestationService.listAll();
  console.log('getAllRecommendations', { attestations });
  return new SuccessResponse(attestations).send(res);
};

export const getCommunityRecommendations = async (req: Request, res: Response, _next: NextFunction) => {
  const { communityId } = req.params;
  logger.info({ communityId }, 'GetCommunityRecommendations');
  const attestations = await attestationService.listCommunityAttestations(parseInt(communityId));
  console.log('getCommunityRecommendations', { attestations });
  logger.info({ attestations: attestations.length }, 'GetCommunityRecommendations');
  return new SuccessResponse(attestations).send(res);
};
