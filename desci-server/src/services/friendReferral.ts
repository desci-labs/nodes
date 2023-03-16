import { FriendReferralStatus } from '@prisma/client';

import client from '../client';

export const getReferralByUuid = async (referralUuid: string) => {
  console.log('friendReferral::getReferralByUuid');

  const referral = await client.friendReferral.findFirst({ where: { uuid: referralUuid } });

  return referral;
};

export const getReferralsByUserId = async (userId: number) => {
  console.log('friendReferral::getReferralsByUserId');

  const referrals = await client.friendReferral.findMany({ where: { senderUserId: userId } });

  return referrals;
};

export const saveFriendReferral = async (senderUserId: number, receiverEmail: string) => {
  console.log('friendReferral::saveFriendReferral');

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
  console.log('friendReferral::updateReferralStatus');
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
  console.log('friendReferral::updateReferralAwardedStorage');
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
