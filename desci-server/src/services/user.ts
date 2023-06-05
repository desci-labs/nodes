import { User } from '@prisma/client';

import parentLogger from 'logger';
import { hideEmail } from 'utils';

import client from '../client';

const logger = parentLogger.child({
  module: 'Services::User',
});

export async function increaseUsersDriveLimit(userId: number, { amountGb }: { amountGb: number }): Promise<User> {
  logger.trace({ fn: 'increaseUsersDriveLimit' }, 'user::increaseUsersDriveLimit');
  const user = await client.user.findFirst({ where: { id: userId } });

  if (!user) {
    throw new Error('User not found');
  }

  const currentDriveStorageLimitGb = user.currentDriveStorageLimitGb;
  const maxDriveStorageLimitGb = user.maxDriveStorageLimitGb;

  const newDriveStorageLimitGb = currentDriveStorageLimitGb + amountGb;

  const canIncreaseUserStorageLimit = newDriveStorageLimitGb <= maxDriveStorageLimitGb;
  if (!canIncreaseUserStorageLimit) {
    throw new Error('User exceeded storage limit');
  }

  logger.info(
    { fn: 'increaseUsersDriveLimit', oldStorageLimitGb: currentDriveStorageLimitGb, newDriveStorageLimitGb },
    `Updating users drive limit to ${newDriveStorageLimitGb}`,
  );

  const updatedUser = await client.user.update({
    where: {
      id: userId,
    },
    data: {
      currentDriveStorageLimitGb: newDriveStorageLimitGb,
    },
  });

  return updatedUser;
}

export async function getUserByOrcId(orcid: string): Promise<User | null> {
  logger.trace({ fn: 'getUserByOrcId' }, 'user::getUserByOrcId');
  const user = await client.user.findFirst({ where: { orcid } });

  return user;
}

export async function getUserByEmail(email: string): Promise<User | null> {
  logger.trace({ fn: 'getUserByEmail' }, `user::getUserByEmail ${hideEmail(email)}`);
  const user = await client.user.findFirst({ where: { email } });

  return user;
}

export async function createUser({
  name,
  email,
  orcid,
  isPatron = false,
  isWarden = false,
  isKeeper = false,
}: {
  name: string;
  email: string;
  orcid?: string;
  isPatron?: boolean;
  isWarden?: boolean;
  isKeeper?: boolean;
}): Promise<User> {
  logger.trace({ fn: 'createUser' }, 'user::createUser');
  const user = await client.user.upsert({
    where: {
      email,
    },
    update: {},
    create: {
      email,
      name,
      orcid,
      isPatron,
      isWarden,
      isKeeper,
    },
  });

  return user;
}

export const getCountNewUsersInXDays = async (daysAgo: number): Promise<number> => {
  logger.trace({ fn: 'getCountNewUsersInXDays' }, 'user::getCountNewUsersInXDays');
  const dateXDaysAgo = new Date(new Date().getTime() - daysAgo * 24 * 60 * 60 * 1000);

  const newUsersInXDays = await client.user.count({
    where: {
      createdAt: {
        gte: dateXDaysAgo,
      },
    },
  });

  return newUsersInXDays;
};

// get new user count for specified month
export const getCountNewUsersInMonth = async (month: number, year: number): Promise<number> => {
  logger.trace({ fn: 'getCountNewUsersInMonth' }, 'user::getCountNewUsersInMonth');
  const startDate = new Date(year, month, 1);
  const endDate = new Date(year, month + 1, 1);

  const newUsersInMonth = await client.user.count({
    where: {
      createdAt: {
        gte: startDate,
        lt: endDate,
      },
    },
  });

  return newUsersInMonth;
};
