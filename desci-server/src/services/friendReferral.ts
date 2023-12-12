import { FriendReferralStatus } from '@prisma/client';

import { prisma as client } from '../client.js';
import { logger as parentLogger } from '../logger.js';

const logger = parentLogger.child({ module: 'Services::FriendReferral' });

export const getReferralByUuid = async (referralUuid: string) => {
  logger.trace({ fn: 'getReferralByUuid', referralUuid }, 'friendReferral::getReferralByUuid');

  const referral = await client.friendReferral.findFirst({ where: { uuid: referralUuid } });

  return referral;
};

export const getReferralsByUserId = async (userId: number) => {
  logger.trace({ fn: 'getReferralByUuid', userId }, 'friendReferral::getReferralsByUserId');

  const referrals = await client.friendReferral.findMany({ where: { senderUserId: userId } });

  return referrals;
};

export const saveFriendReferral = async (senderUserId: number, receiverEmail: string) => {
  logger.trace({ fn: 'saveFriendReferral', senderUserId, receiverEmail }, 'friendReferral::saveFriendReferral');

  const existingReferral = await client.friendReferral.findFirst({ where: { senderUserId, receiverEmail } });

  if (existingReferral) {
    return existingReferral;
  }

  const newReferral = await client.friendReferral.create({
    data: {
      senderUserId,
      receiverEmail,
      status: FriendReferralStatus.PENDING,
    },
  });

  return newReferral;
};

export const updateReferralStatus = async (referralUuid: string, status: FriendReferralStatus) => {
  logger.trace({ fn: 'updateReferralStatus', referralUuid, status }, 'friendReferral::updateReferralStatus');
  return await client.friendReferral.update({
    where: {
      uuid: referralUuid,
    },
    data: {
      status,
    },
  });
};

export const updateReferralAwardedStorage = async (
  referralUuid: string,
  awardedStorage: boolean,
  { amountGb }: { amountGb: number },
) => {
  logger.trace(
    { fn: 'updateReferralAwardedStorage', referralUuid, awardedStorage, amountGb },
    'friendReferral::updateReferralAwardedStorage',
  );
  return await client.friendReferral.update({
    where: {
      uuid: referralUuid,
    },
    data: {
      awardedStorage,
      amountAwardedStorageGb: amountGb,
    },
  });
};
