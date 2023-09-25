import { AuthToken, AuthTokenSource, User, prisma } from '@prisma/client';

import { OrcIdRecordData, getOrcidRecord } from 'controllers/auth';
import parentLogger from 'logger';
import { hideEmail } from 'utils';

import client from '../client';

import { getUserConsent } from './interactionLog';
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

// add orcid auth token to user
interface OrcidAuthPayload {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export async function isAuthTokenSetForUser(userId: number): Promise<boolean> {
  logger.trace({ fn: 'isAuthTokenSetForUser' }, 'user::isAuthTokenSetForUser');
  const authToken = await client.authToken.findFirst({
    where: {
      userId,
      source: AuthTokenSource.ORCID,
    },
  });
  return !!authToken;
}

export async function connectOrcidToUserIfPossible(
  userId: number,
  orcid: string,
  accessToken: string,
  refreshToken: string,
  expiresIn: number,
  orcidLookup: (orcid: string, accessToken: string) => Promise<OrcIdRecordData> = getOrcidRecord,
) {
  logger.info({ fn: 'connectOrcidToUserIfPossible', orcid, accessTokenPresent: !!accessToken }, `doing orcid lookup`);
  const orcidRecord = await orcidLookup(orcid, accessToken);
  logger.info({ fn: 'connectOrcidToUserIfPossible', orcidRecord, orcid }, `found orcid record`);

  // if the orcid in the access token doesn't match, we must fail the process because the requestor is not guaranteed to be the owner of the orcid
  if (orcidRecord['orcid-identifier'].path !== orcid) {
    logger.warn({ fn: 'connectOrcidToUserIfPossible', orcidRecord, orcid }, `orcid record mismatch`);
    return { error: 'orcid mismatch', code: 1 };
  }

  const user = userId
    ? await client.user.findFirst({
        where: {
          id: userId,
        },
      })
    : null;

  if (user) {
    // we are already email auth'd, we have only one to check
    logger.info({ fn: 'orcidCheck', user }, `Requesting user ${user}`);
    if (!user.orcid || user.orcid === orcid) {
      let nodeConnect;
      debugger;
      if (!user.orcid || !(await isAuthTokenSetForUser(user.id))) {
        nodeConnect = await setOrcidForUser(user.id, orcid, {
          accessToken,
          refreshToken,
          expiresIn,
        });
      }
      return { userFound: true, nodeConnect };
    } else {
      return { error: 'orcid mismatch', code: 2, userFound: true };
    }
  } else {
    // we are not email auth'd, we have to check all users for this orcid
    logger.info({ fn: 'orcidCheck' }, `Orcid first time login, no associated email`);
    const userFound = await getUserByOrcId(orcid);
    if (userFound) {
      let nodeConnect;
      debugger;
      if (!userFound.orcid || !(await isAuthTokenSetForUser(userFound.id))) {
        nodeConnect = await setOrcidForUser(user.id, orcid, {
          accessToken,
          refreshToken,
          expiresIn,
        });
      }
      return { userFound: true, nodeConnect };
    } else {
      // we didn't find a user, so we need to prompt for an email verification flow to assign an email to this orcid
      return { error: 'need to attach email', code: 3, userFound: false, promptEmail: true };
    }
  }
}

interface NodeConnectAuthError {
  error?: string;
  ok: boolean;
}

export async function setOrcidForUser(
  userId: number,
  orcid: string,
  auth: OrcidAuthPayload,
): Promise<boolean | NodeConnectAuthError> {
  logger.trace({ fn: 'setOrcidForUser' }, 'user::setOrcidForUser');
  const user = await client.user.findFirst({ where: { id: userId } });
  if (!user) {
    const payload = { ok: false, error: 'User not found' };
    logger.warn({ fn: 'setOrcidForUser', userId, orcid, ...payload }, payload.error);
    return payload;
  }
  if (user.orcid && user.orcid !== orcid) {
    const payload = { ok: false, error: 'This email address is registered to a different ORCiD ID' };
    logger.warn({ fn: 'setOrcidForUser', userId, orcid: user.orcid, newOrcid: orcid, ...payload }, payload.error);
    return payload;
  }
  // handle if another user is tied to this orcid
  if (user) {
    const userWithOrcid = await getUserByOrcId(orcid);
    if (userWithOrcid && userWithOrcid.id !== user.id) {
      const payload = {
        ok: false,
        error:
          'This ORCiD is already registered to another user' +
          [user, userWithOrcid]
            .filter(Boolean)
            .map((a) => a?.id)
            .join('|'),
      };
      logger.warn({ fn: 'setOrcidForUser', userId, orcid, ...payload }, payload.error);
      return payload;
    }

    ///  TODO: wrap in transaction
    const userUpdate = await client.user.update({
      where: {
        id: userId,
      },
      data: {
        orcid,
      },
    });
    logger.trace({ fn: 'setOrcidForUser' }, 'updated user');
    const authTokenInsert = await client.authToken.create({
      data: {
        accessToken: auth.accessToken,
        refreshToken: auth.refreshToken,
        expiresIn: auth.expiresIn,
        userId,
        source: AuthTokenSource.ORCID,
      },
    });
    logger.trace({ fn: 'setOrcidForUser' }, 'added auth token');
  }
  return true;
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

export async function checkIfUserAcceptedTerms(email: string): Promise<boolean> {
  logger.trace({ fn: 'checkIfUserAcceptedTerms' }, `user::checkIfUserAcceptedTerms ${hideEmail(email)}`);
  const user = await client.user.findFirst({
    where: {
      email,
    },
  });
  return !!(await getUserConsent(user.id));
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
