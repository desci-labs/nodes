import { NextFunction, Request, Response } from 'express';
import _ from 'lodash';

import { SuccessResponse, attestationService } from '../../internal.js';

export const getAllRecommendations = async (_req: Request, res: Response, _next: NextFunction) => {
  const attestations = await attestationService.listAll();

  return new SuccessResponse(attestations).send(res);
};

export const getCommunityRecommendations = async (req: Request, res: Response, _next: NextFunction) => {
  const { communityId } = req.params;
  // if (!communityId) return new BadRequestResponse('CommunityId required').send()
  const attestations = await attestationService.listCommunityAttestations(parseInt(communityId));

  return new SuccessResponse(attestations).send(res);
};
