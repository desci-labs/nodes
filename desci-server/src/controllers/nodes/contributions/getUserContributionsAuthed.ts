import { Request, Response } from 'express';

import { logger as parentLogger } from '../../../logger.js';
import { NodeContributorMap, contributorService } from '../../../services/Contributors.js';
import { User } from '@prisma/client';


export type GetNodeContributionsAuthedRequest = Request & {
  user: User; // Added by the ensureUser middleware
};

export type GetUserContributionsAuthedResBody =
  | {
      ok: boolean;
      userContributionsMap: NodeContributorMap;
    }
  | {
      error: string;
    };

export const getUserContributionsAuthed = async (
  req: GetNodeContributionsAuthedRequest,
  res: Response<GetUserContributionsAuthedResBody>,
) => {
const user = req.user

  const logger = parentLogger.child({
    module: 'Contributors::getUserContributionsAuthedController',
    body: req.body,
    userId: user.id,
  });

  if (!user) {
    return res.status(401).json({ error: 'user required' });
  }

  try {
    const userContributionsMap: NodeContributorMap =
      await contributorService.retrieveUserContributionMap(user);
    if (userContributionsMap) {
      logger.info({ totalContributions: userContributionsMap.length }, 'User contributions map retrieved successfully');
      return res.status(200).json({ ok: true, userContributionsMap });
    }
  } catch (e) {
    logger.error({ e }, 'Failed to retrieve user contributions map');
    return res.status(500).json({ error: 'Failed to retrieve user contributions map' });
  }

  return res.status(500).json({ error: 'Something went wrong' });
};
