import { ActionType, FriendReferralStatus, User } from '@prisma/client';
import { Request, Response } from 'express';

import { logger as parentLogger } from '../../logger.js';
import {
  getReferralByUuid,
  updateReferralAwardedStorage,
  updateReferralStatus,
} from '../../services/friendReferral.js';
import { saveInteraction } from '../../services/interactionLog.js';
import { increaseUsersDriveLimit } from '../../services/user.js';
export const DRIVE_STORAGE_LIMIT_INCREASE_GB = 5;

export const acceptReferralById = async (req: Request, res: Response) => {
  const user = (req as any).user as User;
  const referralUuid = req.params.referralUuid;
  const logger = parentLogger.child({
    // id: req.id,
    module: 'REFERRAL::acceptReferralByIdController',
    body: req.body,
    params: req.params,
    referralUuid,
    user: (req as any).user,
  });
  try {
    logger.trace(`Incoming params ${req.params}`);
    if (!referralUuid) {
      res.status(400).send({ message: 'No referralUuid passed in', param: req.params.referralUuid });
      return;
    }

    logger.info(`Accepting referral for authd user ${user.id} ${referralUuid}`);
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
      logger.trace('Updating users drive limit');
      await increaseUsersDriveLimit(user.id, { amountGb: DRIVE_STORAGE_LIMIT_INCREASE_GB });
      logger.trace('Setting referral awarded status to true');
      updatedReferral = await updateReferralAwardedStorage(updatedReferral.uuid, true, {
        amountGb: DRIVE_STORAGE_LIMIT_INCREASE_GB,
      });
    } catch (error) {
      /**
       * Move on, we don't want to fail the whole request if we can't update the users drive limit
       */
      logger.error({ error }, 'Error updating users drive limit');
    }

    await saveInteraction(req, ActionType.ACCEPTED_REFERRAL, { referralUuid });

    res.send({
      user,
      updatedReferral,
    });

    return;
  } catch (err) {
    logger.error({ err }, 'err');
    res.status(500).send({ err });
    return;
  }
};
