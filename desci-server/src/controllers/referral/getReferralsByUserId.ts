import { User } from '@prisma/client';
import { Request, Response } from 'express';

import { logger as parentLogger } from '../../logger.js';
import { getReferralsByUserId as getReferralsByUserIdDb } from '../../services/friendReferral.js';

export const getReferralsByUserId = async (req: Request, res: Response) => {
  const logger = parentLogger.child({
    module: 'REFERRAL::getReferralsByUserIdController',
    body: req.body,
    user: (req as any).user,
  });
  try {
    const user = (req as any).user as User;
    logger.trace(`Fetching referrals for authd user ${user.id}`);

    const referrals = await getReferralsByUserIdDb(user.id);

    res.send({
      user,
      referrals,
    });

    return;
  } catch (err) {
    logger.error({ err }, 'err');
    res.status(500).send({ err });
    return;
  }
};
