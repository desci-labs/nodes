import { User } from '@prisma/client';
import { Request, Response } from 'express';

import { getReferralsByUserId as getReferralsByUserIdDb } from 'services/friendReferral';

export const getReferralsByUserId = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user as User;
    console.log('Fetching referrals for authd user', user.id);

    const referrals = await getReferralsByUserIdDb(user.id);

    res.send({
      user,
      referrals,
    });

    return;
  } catch (err) {
    console.error('err', err);
    res.status(500).send({ err });
    return;
  }
};
