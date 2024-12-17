import { AuthTokenSource, User } from '@prisma/client';
import axios from 'axios';

import { prisma as client } from '../client.js';
import { OrcIdRecordData, generateAccessToken, getOrcidRecord } from '../controllers/auth/index.js';
import { logger as parentLogger } from '../logger.js';
import { hideEmail } from '../utils.js';

import { contributorService } from './Contributors.js';
import { getUserConsent } from './interactionLog.js';
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

export async function writeExternalIdToOrcidProfile(userId: number, didAddress: string) {
  const user = await client.user.findFirst({
    where: {
      id: userId,
    },
  });
  if (!user.orcid) {
    throw new Error('User does not have an orcid');
  }
  const authToken = await client.authToken.findFirst({
    where: {
      userId,
      source: AuthTokenSource.ORCID,
    },
  });
  if (!authToken) {
    throw new Error('User does not have an orcid auth token');
  }
  // check if it's already written to orcid
  const headers = {
    'Content-Type': 'application/vnd.orcid+json',
    Authorization: `Bearer ${authToken.accessToken}`,
  };
  const orcidId = user.orcid;
  const fullDid = `did:pkh:eip155:1:${didAddress}`;
  try {
    const externalIds = await axios.get(
      `https://api.${process.env.ORCID_API_DOMAIN}/v3.0/${orcidId}/external-identifiers`,
      { headers },
    );
    if (externalIds.data['external-identifier'].some((id) => id['external-id-value'] === fullDid)) {
      console.log('External ID already added');
      return;
    }
    // debugger;
  } catch (error) {
    console.error('Error getting external IDs:', error.response?.data || error.message);
  }

  const apiUrl = `https://api.${process.env.ORCID_API_DOMAIN}/v3.0/${orcidId}/external-identifiers`;
  const externalIdPayload = {
    'external-id-type': 'Public Key',
    'external-id-value': fullDid,
    'external-id-url': {
      value: `https://nodes.desci.com/orcid-did/${didAddress}`,
    },
    'external-id-relationship': 'self',
  };

  try {
    const response = await axios.post(apiUrl, externalIdPayload, { headers });
    console.log('External ID added:', response.data);
  } catch (error) {
    console.error('Error adding external ID:', error.response?.data || error.message);
  }
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
  logger.info({ fn: 'connectOrcidToUserIfPossible', orcid }, `found orcid record`);

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
      let nodeConnect: Awaited<ReturnType<typeof setOrcidForUser>>;
      if (!user.orcid || !(await isAuthTokenSetForUser(user.id))) {
        nodeConnect = await setOrcidForUser(user.id, orcid, {
          accessToken,
          refreshToken,
          expiresIn,
        });
      }
      const jwt = generateAccessToken({ email: user.email });
      return { userFound: true, nodeConnect, jwt };
    } else {
      return { error: 'orcid mismatch', code: 2, userFound: true };
    }
  } else {
    // we are not email auth'd, we have to check all users for this orcid
    const userFound = await getUserByOrcId(orcid);
    if (userFound) {
      logger.info({ fn: 'orcidCheck' }, `Orcid fresh login, No exisiting auth `);
      const nodeConnect = await setOrcidForUser(userFound.id, orcid, {
        accessToken,
        refreshToken,
        expiresIn,
      });
      const jwt = generateAccessToken({ email: userFound.email });
      return { userFound: true, nodeConnect, jwt };
    } else {
      logger.info({ reason: 'No associated user found, prompt for email' }, 'OrcidCheck');
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
          'This ORCiD is already registered to another user (code: 1020-' +
          [user, userWithOrcid]
            .filter(Boolean)
            .map((a) => a?.id)
            .join('-') +
          ')',
      };
      logger.warn({ fn: 'setOrcidForUser', userId, orcid, ...payload }, payload.error);
      return payload;
    }

    ///  TODO: wrap in transaction
    if (userId) {
      const userUpdate = await client.user.update({
        where: {
          id: userId,
        },
        data: {
          orcid,
        },
      });
      logger.trace({ fn: 'setOrcidForUser' }, 'updated user');

      await client.authToken.create({
        data: {
          accessToken: auth.accessToken,
          refreshToken: auth.refreshToken,
          expiresIn: auth.expiresIn,
          userId,
          source: AuthTokenSource.ORCID,
        },
      });
      logger.trace({ fn: 'setOrcidForUser' }, 'added auth token');

      // Inherits existing user contribution entries that were made with the same ORCID
      const inheritedContributions = await contributorService.updateContributorEntriesForNewUser({
        orcid,
        userId: user.id,
      });
      logger.trace({ inheritedContributions: inheritedContributions?.count, user, orcid });
    } else {
      logger.trace({ fn: 'setOrcidForUser' }, 'no user found');
      return false;
    }
  }
  return true;
}

export async function getUserByOrcId(orcid: string): Promise<User | null> {
  logger.trace({ fn: 'getUserByOrcId' }, 'user::getUserByOrcId');
  if (!orcid) {
    logger.error({ fn: 'getUserByOrcId' }, 'user::getUserByOrcId No orcid');
    return null;
  }
  const user = await client.user.findFirst({ where: { orcid } });

  return user;
}

export async function getUserByEmail(email: string): Promise<User | null> {
  try {
    logger.trace({ fn: 'getUserByEmail' }, `user::getUserByEmail ${hideEmail(email)}`);

    if (!email) {
      logger.error({ email }, 'getUserByEmail: No email');
      return null;
    }

    const user = await client.user.findFirst({
      where: {
        email: {
          equals: email,
          mode: 'insensitive',
        },
      },
    });

    return user;
  } catch (err) {
    logger.error({ err }, 'getUserByEmail');
    return null;
  }
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
