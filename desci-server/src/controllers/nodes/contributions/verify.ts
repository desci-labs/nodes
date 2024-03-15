import { Request, Response } from 'express';

import { logger as parentLogger } from '../../../logger.js';
import { contributorService } from '../../../services/Contributors.js';

export const verifyContribution = async (req: Request, res: Response) => {
  const user = (req as any).user;

  if (!user) throw Error('Middleware not properly setup for verifyContribution controller, requires req.user');

  const { contributorId } = req.body;

  const logger = parentLogger.child({
    module: 'Contributors::verifyContributionController',
    body: req.body,
    user: (req as any).user,
    contributorId,
  });

  if (!contributorId) {
    return res.status(400).json({ error: 'contributorId is required' });
  }

  try {
    const verified = await contributorService.verifyContribution(user, contributorId);
    if (verified) {
      logger.info('Contribution verified successfully');
      return res.status(200).json({ message: 'Contribution verified successfully' });
    }
  } catch (e) {
    logger.error({ e }, 'Failed to verify contributor');
    return res.status(500).json({ error: 'Failed to verify contribution' });
  }

  return res.status(500).json({ error: 'Something went wrong' });
};
