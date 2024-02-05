import { NodeFeedItemEndorsement, Prisma } from '@prisma/client';
import { Request, Response, NextFunction } from 'express';

import { prisma } from '../../client.js';
import { logger as parentLogger } from '../../logger.js';
import communityService from '../../services/Communities.js';

type ListCuratedRequestParams = {
  communityId: string;
};

type ListCuratedResponse = {
  ok: boolean;
  curations?: NodeFeedItemEndorsement[];
  error?: string;
};

/**
 * Kind of redundant at the moment, upgrade this to a pagination route when necessary.
 */
export const listCurated = async (req: Request<ListCuratedRequestParams>, res: Response<ListCuratedResponse>) => {
  const { communityId } = req.params;

  const logger = parentLogger.child({
    // id: req.id,
    module: 'COMMUNITIES::listCuratedController',
    user: (req as any).user,
    communityId,
  });

  if (!communityId) return res.status(400).send({ ok: false, error: 'Community ID is required' });

  logger.trace(`listCurated`);

  try {
    const curatedNodes = await communityService.getAllCommunityEndorsements(parseInt(communityId));
    return res.status(200).send({ ok: true, curations: curatedNodes });
  } catch (e) {
    logger.error(e);
    return res.status(400).send({ ok: false, error: 'Failed to retrieve curations' });
  }
};
