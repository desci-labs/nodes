import { NodeFeedItemEndorsement, Prisma } from '@prisma/client';
import { Request, Response, NextFunction } from 'express';

import { prisma } from '../../client.js';
import { logger as parentLogger } from '../../logger.js';
import communityService from '../../services/Communities.js';

export type CommunityFragment = {
  id: number;
  name: string;
  description: string;
  image_url: string;
  //   endorsements: NodeFeedItemEndorsement[];
};

type ListCommunitiesResponse = {
  ok: boolean;
  communities?: CommunityFragment[];
  error?: string;
};

export const listCommunities = async (req: Request, res: Response<ListCommunitiesResponse>) => {
  const logger = parentLogger.child({
    // id: req.id,
    module: 'COMMUNITIES::listController',
    user: (req as any).user,
  });
  logger.trace(`listCommunities`);

  try {
    const communities = await communityService.getAllCommunities();

    return res.status(200).send({ ok: true, communities: communities });
  } catch (e) {
    logger.error(e);
    return res.status(400).send({ ok: false, error: 'Failed to retrieve communities' });
  }
};
