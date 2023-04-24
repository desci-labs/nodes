import { ActionType, FriendReferralStatus, User } from '@prisma/client';
import { Request, Response } from 'express';

import { getReferralByUuid, updateReferralAwardedStorage, updateReferralStatus } from 'services/friendReferral';
import { saveInteraction } from 'services/interactionLog';
import { increaseUsersDriveLimit } from 'services/user';

export const DRIVE_STORAGE_LIMIT_INCREASE_GB = 5;

export const acceptReferralById = async (req: Request, res: Response) => {
  try {
    console.log('Incoming params', req.params);
    const user = (req as any).user as User;
    const referralUuid = req.params.referralUuid;

    if (!referralUuid) {
      res.status(400).send({ message: 'No referralUuid passed in', param: req.params.referralUuid });
      return;
    }

    console.log('Accepting referral for authd user', user.id, referralUuid);
    const referralToUpdate = await getReferralByUuid(referralUuid);
    const isReferralForAcceptingUser = referralToUpdate.receiverEmail === user.email;

    if (!isReferralForAcceptingUser) {
      res.status(401).send({ message: 'You are not authorized to accept this referral' });
      return;
    }

    if (referralToUpdate.status === FriendReferralStatus.ACCEPTED) {
      res.send({
        user,
        updatedReferral: referralToUpdate,
      });
      return;
    }

    let updatedReferral = await updateReferralStatus(referralUuid, FriendReferralStatus.ACCEPTED);

    try {
      console.log('Updating users drive limit');
      await increaseUsersDriveLimit(user.id, { amountGb: DRIVE_STORAGE_LIMIT_INCREASE_GB });
      console.log('Setting referral awarded status to true');
      updatedReferral = await updateReferralAwardedStorage(updatedReferral.uuid, true, {
        amountGb: DRIVE_STORAGE_LIMIT_INCREASE_GB,
      });
    } catch (error) {
      /**
       * Move on, we don't want to fail the whole request if we can't update the users drive limit
       */
      console.log(error);
    }

    await saveInteraction(req, ActionType.ACCEPTED_REFERRAL, { referralUuid });

    res.send({
      user,
      updatedReferral,
    });

    return;
  } catch (err) {
    console.error('err', err);
    res.status(500).send({ err });
    return;
  }
};
