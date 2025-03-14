import { NextFunction, Request, Response } from 'express';
import _ from 'lodash';

import { SuccessResponse } from '../../core/ApiResponse.js';
import { logger as parentLogger } from '../../logger.js';
import { communityService } from '../../services/Communities.js';
import { asyncMap } from '../../utils.js';

const logger = parentLogger.child({ module: 'LIST COMMUNITIES' });

export const listCommunities = async (_req: Request, res: Response, _next: NextFunction) => {
  const allCommunities = await communityService.getCommunities();
  const pickedCommunities = allCommunities.map((community) =>
    _.pick(community, [
      'id',
      'name',
      'subtitle',
      'memberString',
      'hidden',
      'links',
      'description',
      'image_url',
      'keywords',
      'slug',
    ]),
  );

  const communities = await asyncMap(pickedCommunities, async (community) => {
    const engagements = await communityService.getCommunityEngagementSignals(community.id);
    const verifiedEngagements = await communityService.getCommunityRadarEngagementSignal(community.id);
    return {
      community,
      engagements,
      verifiedEngagements,
    };
  });
  logger.info({ communities: communities.length });

  new SuccessResponse(communities).send(res);
};
