import { Node, User } from '@prisma/client';
import { Request, Response } from 'express';

import { logger as parentLogger } from '../../../logger.js';
import { contributorService } from '../../../services/Contributors.js';

export type DenyContributionReqBody = {
  contributorId: string;
};

export type DenyContributionRequest = Request<never, never, DenyContributionReqBody> & {
  user: User; // added by auth middleware
};

export type DenyContributionResBody =
  | {
      ok: boolean;
      message: string;
    }
  | {
      error: string;
    };

export const denyContribution = async (req: DenyContributionRequest, res: Response<DenyContributionResBody>) => {
  const user = (req as any).user;

  if (!user) throw Error('Middleware not properly setup for verifyContribution controller, requires req.user');

  const { contributorId } = req.body;

  const logger = parentLogger.child({
    module: 'Contributors::denyContributionController',
    body: req.body,
    user: (req as any).user,
    contributorId,
  });

  if (!contributorId) {
    return res.status(400).json({ error: 'contributorId is required' });
  }

  try {
    const deniedUpdate = await contributorService.denyContribution(user, contributorId);
    if (deniedUpdate) {
      logger.info('Contribution denied successfully');
      return res.status(200).json({ ok: true, message: 'Contribution denied successfully' });
    }
  } catch (e) {
    logger.error({ e }, 'Failed to deny contribution');
    return res.status(500).json({ error: 'Failed to deny contribution' });
  }

  return res.status(500).json({ error: 'Something went wrong' });
};
