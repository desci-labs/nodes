import { Request, Response } from 'express';

import { prisma } from '../../../client.js';
import { logger as parentLogger } from '../../../logger.js';
import { UserContribution, contributorService } from '../../../services/Contributors.js';

export type GetUserContributionsRequest = Request<never, never, { userId: number }>;

export type GetUserContributionsResBody =
  | {
      ok: boolean;
      userContributions: UserContribution[];
    }
  | {
      error: string;
    };

export const getUserContributions = async (
  req: GetUserContributionsRequest,
  res: Response<GetUserContributionsResBody>,
) => {
  const { userId } = req.params;

  const logger = parentLogger.child({
    module: 'Contributors::getUserContributionsController',
    body: req.body,
    userId,
  });

  if (!userId) {
    return res.status(400).json({ error: 'userId required' });
  }

  try {
    const user = await prisma.user.findUnique({ where: { id: parseInt(userId) } });
    const userContributions = await contributorService.retrieveContributionsForUser(user);
    if (userContributions) {
      logger.info({ totalContributions: userContributions.length }, 'Contributions retrieved successfully');
      return res.status(200).json({ ok: true, userContributions });
    }
  } catch (e) {
    logger.error({ e }, 'Failed to retrieve user contributions');
    return res.status(500).json({ error: 'Failed to retrieve user contributions' });
  }

  return res.status(500).json({ error: 'Something went wrong' });
};
