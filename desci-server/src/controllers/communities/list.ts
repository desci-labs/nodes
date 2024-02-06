import { NextFunction, Request, Response } from 'express';
import _ from 'lodash';

import { SuccessResponse, communityService } from '../../internal.js';

export const listCommunities = async (_req: Request, res: Response, _next: NextFunction) => {
  const allCommunities = await communityService.getCommunities();
  const communities = allCommunities.map((community) =>
    _.pick(community, ['id', 'name', 'description', 'image_url', 'keywords']),
  );

  // TODO:  get all engagements across all communities
  // const engagements = await Promise.all()
  // const allEngagements = //

  return new SuccessResponse(communities).send(res, {});
};
