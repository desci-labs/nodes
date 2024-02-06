import { NodeFeedItemEndorsement, Prisma } from '@prisma/client';
import { Request, Response, NextFunction } from 'express';
import { pick } from 'lodash-es';

import { prisma } from '../../client.js';
import { logger as parentLogger } from '../../logger.js';
import { communityService } from '../../services/Communities.js';

type CommunityFragment = {
  id: number;
  name: string;
  description: string;
  image_url: string;
  endorsements: NodeFeedItemEndorsement[]; // Subject to removal into its own route when necessary
  // radarFeed:
  // members: MemberFragment[];
};

type MemberFragment = {
  role: string;
  user: {
    name: string;
    orcid?: string;
  };
};

type ListCommunitiesResponse = {
  ok: boolean;
  community?: CommunityFragment;
  error?: string;
};

export const showCommunity = async (req: Request, res: Response<ListCommunitiesResponse>) => {
  const { communityId } = req.params;

  const logger = parentLogger.child({
    // id: req.id,
    module: 'COMMUNITIES::showCommunityController',
    user: (req as any).user,
    communityId,
  });
  logger.trace(`showCommunity`);
  if (!communityId) return res.status(400).send({ ok: false, error: 'Community ID is required' });

  try {
    const community = await communityService.findCommunityById(parseInt(communityId));
    const curatedNodes = await communityService.getAllCommunityEndorsements(parseInt(communityId));
    const members = await communityService.getAllMembers(parseInt(communityId));

    const memberFragments = members.map((member) => ({
      role: member.role,
      user: pick(member.user, ['name', 'orcid']),
    }));

    return res.status(200).send({
      ok: true,
      community: {
        ...community,
        //  members: memberFragments,
        endorsements: curatedNodes,
      },
    });
  } catch (e) {
    logger.error(e);
    return res.status(400).send({ ok: false, error: 'Failed to retrieve curations' });
  }
};
