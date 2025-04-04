import { NextFunction, Request, Response } from 'express';
import _ from 'lodash';

import { SuccessResponse } from '../../core/ApiResponse.js';
import { logger as parentLogger } from '../../logger.js';
import { communityService } from '../../services/Communities.js';
import { asyncMap } from '../../utils.js';

const logger = parentLogger.child({ module: 'LIST COMMUNITIES' });

export const listCommunities = async (_req: Request, res: Response, _next: NextFunction) => {
  const { skip } = _req.query;
  logger.info({ skip });
  const skipArray = (skip as string)?.split(',') || [];
  const allCommunities = await communityService.getCommunities();
  const skipMembers = skipArray.includes('members');
  const skipDescription = skipArray.includes('description');
  const skipMetrics = skipArray.includes('metrics');
  const skipKeywords = skipArray.includes('keywords');
  const pickedCommunities = allCommunities.map((community) =>
    _.pick(community, [
      'id',
      'name',
      'subtitle',
      ...(skipMembers ? [] : ['memberString']),
      'hidden',
      'links',
      ...(skipDescription ? [] : ['description']),
      'image_url',
      ...(skipKeywords ? [] : ['keywords']),
      'slug',
    ]),
  );

  let communities = pickedCommunities.map((community) => ({
    community,
  }));
  if (!skipMetrics) {
    communities = await asyncMap(pickedCommunities, async (community) => {
      const engagements = await communityService.getCommunityEngagementSignals(community.id);
      const verifiedEngagements = await communityService.getCommunityRadarEngagementSignal(community.id);
      return {
        community,
        engagements,
        verifiedEngagements,
      };
    });
  }
  logger.info({ communities: communities.length });

  new SuccessResponse(communities).send(res);
};
