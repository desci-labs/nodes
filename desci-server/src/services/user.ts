import { ActionType, AuthTokenSource, Prisma, User } from '@prisma/client';
import axios from 'axios';

import { prisma as client } from '../client.js';
import { OrcIdRecordData, generateAccessToken, getOrcidRecord } from '../controllers/auth/index.js';
import { logger as parentLogger } from '../logger.js';
import { getUtcDateXDaysAgo } from '../utils/clock.js';
import { hideEmail } from '../utils.js';

import { safePct } from './admin/helper.js';
import { contributorService } from './Contributors.js';
import { AppType, getUserConsent } from './interactionLog.js';
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

  if (user && !user.isGuest) {
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
      return { userFound: true, nodeConnect, jwt, user };
    } else {
      return { error: 'orcid mismatch', code: 2, userFound: true, user };
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
      return { userFound: true, nodeConnect, jwt, user: userFound };
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

  // Return null if user not found
  if (!user) {
    return null;
  }

  // Initialize trial for new users (only if user was just created, not updated)
  // Check if this was a create (not update) by checking if user was just created
  const isNewUser = user.createdAt.getTime() === user.updatedAt.getTime();
  if (isNewUser) {
    try {
      const { initializeTrialForNewUser } = await import('./subscription.js');
      await initializeTrialForNewUser(user.id);
    } catch (error) {
      // Log but don't fail user creation if trial initialization fails
      logger.error({ error, userId: user.id }, 'Failed to initialize trial for new user');
    }
  }

  return user;
}

export async function getUserById(id: number): Promise<User | null> {
  logger.trace({ fn: 'getUserById' }, 'user::getUserById');
  if (!id) {
    logger.error({ fn: 'getUserById' }, 'user::getUserById No id');
    return null;
  }
  const user = await client.user.findUnique({ where: { id } });

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
  return !!(await getUserConsent(user.id, AppType.PUBLISH));
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

  // Initialize trial for new users (only if user was just created, not updated)
  // Check if this was a create (not update) by checking if user was just created
  const isNewUser = user.createdAt.getTime() === user.updatedAt.getTime();
  if (isNewUser) {
    try {
      const { initializeTrialForNewUser } = await import('../services/subscription.js');
      await initializeTrialForNewUser(user.id);
    } catch (error) {
      // Log but don't fail user creation if trial initialization fails
      logger.error({ error, userId: user.id }, 'Failed to initialize trial for new user');
    }
  }

  return user;
}

export const getCountNewUsersInXDays = async (daysAgo: number): Promise<number> => {
  logger.trace({ fn: 'getCountNewUsersInXDays' }, 'user::getCountNewUsersInXDays');
  const now = new Date();

  const utcMidnightXDaysAgo = getUtcDateXDaysAgo(daysAgo);

  const newUsersInXDays = await client.user.count({
    where: {
      isGuest: false,
      createdAt: {
        gte: utcMidnightXDaysAgo,
      },
    },
  });

  return newUsersInXDays;
};

export const getNewUsersInXDays = async (dateXDaysAgo: Date) => {
  logger.trace({ fn: 'getCountNewUsersInXDays' }, 'user::getCountNewUsersInXDays');

  const newUsersInXDays = await client.user.findMany({
    where: {
      isGuest: false,
      createdAt: {
        gte: dateXDaysAgo,
      },
    },
    select: {
      id: true,
      email: true,
      orcid: true,
      createdAt: true,
    },
  });

  return newUsersInXDays;
};

export const getNewOrcidUsersInXDays = async (dateXDaysAgo: Date) => {
  logger.trace({ fn: 'getCountNewUsersInXDays' }, 'user::getCountNewUsersInXDays');

  const newUsersInXDays = await client.user.findMany({
    where: {
      createdAt: {
        gte: dateXDaysAgo,
      },
      orcid: {
        not: null,
      },
    },
    select: {
      id: true,
      email: true,
      orcid: true,
      createdAt: true,
    },
  });

  return newUsersInXDays;
};

export const getNewSciweaveUsersInXDays = async (dateXDaysAgo: Date) => {
  logger.trace({ fn: 'getNewSciweaveUsersInXDays' }, 'user::getNewSciweaveUsersInXDays');

  // Get users who have USER_SIGNUP_SUCCESS with isSciweave = true in their interaction logs
  // and were created after the specified date
  const sciweaveUserLogs = (await client.$queryRaw`
    SELECT DISTINCT ON (il."userId")
      il."userId",
      u.id,
      u.email,
      u.orcid,
      u."createdAt"
    FROM "InteractionLog" il
    INNER JOIN "User" u ON u.id = il."userId"
    WHERE il.action = 'USER_SIGNUP_SUCCESS'
      AND il."createdAt" >= ${dateXDaysAgo}
      AND il."userId" IS NOT NULL
      AND u."createdAt" >= ${dateXDaysAgo}
      AND u."isGuest" = false
      AND (il.extra :: jsonb ->> 'isSciweave') = 'true'
    ORDER BY il."userId", il."createdAt" ASC
  `) as { userId: number; id: number; email: string; orcid: string | null; createdAt: Date }[];

  return sciweaveUserLogs.map((log) => ({
    id: log.id,
    email: log.email,
    orcid: log.orcid,
    createdAt: log.createdAt,
  }));
};

export const getCountAllUsers = async (): Promise<number> => {
  logger.trace({ fn: 'getCountAllUsers' }, 'user::getCountAllUsers');
  const allUsers = await client.user.count({ where: { isGuest: false } });
  return allUsers;
};

export const getCountAllOrcidUsers = async (): Promise<number> => {
  logger.trace({ fn: 'getCountAllUsers' }, 'user::getCountAllUsers');
  const allUsers = await client.user.count({ where: { orcid: { not: null } } });
  return allUsers;
};

export const getCountAllNonDesciUsers = async (): Promise<number> => {
  logger.trace({ fn: 'getCountAllNonDesciUsers' }, 'user::getCountAllNonDesciUsers');

  const newUsersInXDays = await client.user.count({
    where: {
      email: {
        not: { contains: '@desci.com' },
      },
      isGuest: false,
    },
  });

  return newUsersInXDays;
};

/**
 * Count the new users in X days with ORCID profile linked
 * @param daysAgo
 * @returns
 */
export const getCountNewOrcidUsersInXDays = async (daysAgo: number): Promise<number> => {
  logger.trace({ fn: 'getCountNewUsersInXDays' }, 'user::getCountNewUsersInXDays');
  const now = new Date();

  const utcMidnightXDaysAgo = getUtcDateXDaysAgo(daysAgo);

  const newUsersInXDays = await client.user.count({
    where: {
      createdAt: {
        gte: utcMidnightXDaysAgo,
      },
      orcid: {
        not: null,
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
      isGuest: false,
      createdAt: {
        gte: startDate,
        lt: endDate,
      },
    },
  });

  return newUsersInMonth;
};

// get new orcid user count for specified month
export const getCountNewUsersWithOrcidInMonth = async (month: number, year: number): Promise<number> => {
  logger.trace({ fn: 'getCountNewUsersInMonth' }, 'user::getCountNewUsersInMonth');
  const startDate = new Date(year, month, 1);
  const endDate = new Date(year, month + 1, 1);

  const newUsersInMonth = await client.user.count({
    where: {
      isGuest: false,
      createdAt: {
        gte: startDate,
        lt: endDate,
      },
      orcid: {
        not: null,
      },
    },
  });

  return newUsersInMonth;
};

/**
 * Minimal Data query methods with range arguments
 */

export const getNewUsersInRange = async (range: { from: Date; to: Date }) => {
  logger.trace({ fn: 'getCountNewUsersInXDays' }, 'user::getCountNewUsersInXDays');

  const newUsers = await client.user.findMany({
    where: {
      createdAt: {
        gte: range.from,
        lt: range.to,
      },
      isGuest: false,
    },
    select: {
      createdAt: true,
    },
  });

  return newUsers;
};

export const getNewOrcidUsersInRange = async (range: { from: Date; to: Date }) => {
  logger.trace({ fn: 'getCountNewUsersInXDays' }, 'user::getCountNewUsersInXDays');

  const newUsers = await client.user.findMany({
    where: {
      createdAt: {
        gte: range.from,
        lt: range.to,
      },
      orcid: {
        not: null,
      },
    },
    select: {
      createdAt: true,
    },
  });

  return newUsers;
};

export const getNewSciweaveUsersInRange = async (range: { from: Date; to: Date }) => {
  logger.trace({ fn: 'getNewSciweaveUsersInRange' }, 'user::getNewSciweaveUsersInRange');

  // Get users who have USER_SIGNUP_SUCCESS with isSciweave = true in their interaction logs
  // and were created within the date range
  // Use raw query to get distinct user IDs with their user data
  const sciweaveUserLogs = (await client.$queryRaw`
    SELECT DISTINCT ON (il."userId")
      il."userId",
      u.id,
      u.email,
      u.orcid,
      u."createdAt"
    FROM "InteractionLog" il
    INNER JOIN "User" u ON u.id = il."userId"
    WHERE il.action = 'USER_SIGNUP_SUCCESS'
      AND il."createdAt" >= ${range.from}
      AND il."createdAt" < ${range.to}
      AND il."userId" IS NOT NULL
      AND u."createdAt" >= ${range.from}
      AND u."createdAt" < ${range.to}
      AND u."isGuest" = false
      AND (il.extra :: jsonb ->> 'isSciweave') = 'true'
    ORDER BY il."userId", il."createdAt" ASC
  `) as { createdAt: Date }[];

  return sciweaveUserLogs.map((log) => ({
    createdAt: log.createdAt,
  }));
};

export interface SciweaveUserExportData {
  email: string;
  dateJoined: Date;
  role: string | null;
  sciweaveConsent: boolean;
  sciweaveMarketingConsent: boolean;
}

export const getAllSciweaveUsersForExport = async (range?: {
  from: Date;
  to: Date;
}): Promise<SciweaveUserExportData[]> => {
  logger.trace({ fn: 'getAllSciweaveUsersForExport', range }, 'user::getAllSciweaveUsersForExport');

  // Get all users who have USER_SIGNUP_SUCCESS with isSciweave = true
  // Optionally filter by date range if provided
  const sciweaveUsers = (await client.$queryRaw`
    SELECT DISTINCT ON (il."userId")
      il."userId",
      u.id,
      u.email,
      u."createdAt",
      u."receiveSciweaveMarketingEmails"
    FROM "InteractionLog" il
    INNER JOIN "User" u ON u.id = il."userId"
    WHERE il.action = 'USER_SIGNUP_SUCCESS'
      AND il."userId" IS NOT NULL
      AND u."isGuest" = false
      AND (il.extra :: jsonb ->> 'isSciweave') = 'true'
      ${range ? Prisma.sql`AND u."createdAt" >= ${range.from} AND u."createdAt" < ${range.to}` : Prisma.sql``}
    ORDER BY il."userId", il."createdAt" ASC
  `) as {
    userId: number;
    id: number;
    email: string;
    createdAt: Date;
    receiveSciweaveMarketingEmails: boolean;
  }[];

  // For each user, get their questionnaire data (role) and consent status
  const usersWithData = await Promise.all(
    sciweaveUsers.map(async (user) => {
      // Get questionnaire data for role
      const questionnaire = await client.interactionLog.findFirst({
        where: {
          userId: user.userId,
          action: ActionType.SUBMIT_SCIWEAVE_QUESTIONNAIRE,
        },
        select: {
          extra: true,
        },
      });

      let role: string | null = null;
      if (questionnaire?.extra) {
        try {
          const data = JSON.parse(questionnaire.extra) as { role?: string };
          role = data.role || null;
        } catch (error) {
          logger.warn({ error, userId: user.userId }, 'Failed to parse questionnaire data');
        }
      }

      // Check if user has sciweave consent (USER_SCIWEAVE_TERMS_CONSENT)
      const consent = await client.interactionLog.findFirst({
        where: {
          userId: user.userId,
          action: ActionType.USER_SCIWEAVE_TERMS_CONSENT,
        },
      });

      return {
        email: user.email,
        dateJoined: user.createdAt,
        role,
        sciweaveConsent: !!consent,
        sciweaveMarketingConsent: user.receiveSciweaveMarketingEmails,
      };
    }),
  );

  return usersWithData;
};

export const countAllUsers = async (range?: { from: Date; to: Date }): Promise<number> => {
  logger.trace({ fn: 'countAllUsers' }, 'user::countAllUsers');
  return await client.user.count({ where: { ...(range && { createdAt: { gte: range.from, lt: range.to } }) } });
};

export const countAllGuestUsersWhoSignedUp = async (range?: { from: Date; to: Date }): Promise<number> => {
  logger.trace({ fn: 'countAllUsers' }, 'user::countAllUsers');
  const allGuestUsers = await client.user.count({
    where: {
      ...(range && { createdAt: { gte: range.from, lt: range.to } }),
      OR: [{ isGuest: true }, { convertedGuest: true }],
    },
  });

  if (allGuestUsers === 0) {
    return 0;
  }

  const signedUpGuestUsers = await client.user.count({
    where: {
      ...(range && { createdAt: { gte: range.from, lt: range.to } }),
      isGuest: false,
      convertedGuest: true,
    },
  });
  return safePct(signedUpGuestUsers, allGuestUsers);
};

/**
 * Get users who opted-in to receive marketing emails
 */
export const getUsersWithMarketingConsent = async (range?: { from: Date; to: Date }) => {
  logger.trace({ fn: 'getUsersWithMarketingConsent' }, 'user::getUsersWithMarketingConsent');

  const users = await client.user.findMany({
    where: {
      receiveMarketingEmails: true,
      isGuest: false,
      ...(range && { createdAt: { gte: range.from, lt: range.to } }),
    },
    select: {
      email: true,
    },
    orderBy: {
      createdAt: 'desc',
    },
  });

  return users;
};

/**
 * Get users who opted-in to receive Sciweave marketing emails
 */
export const getUsersWithSciweaveMarketingConsent = async (range?: { from: Date; to: Date }) => {
  logger.trace({ fn: 'getUsersWithSciweaveMarketingConsent' }, 'user::getUsersWithSciweaveMarketingConsent');

  const users = await client.user.findMany({
    where: {
      receiveSciweaveMarketingEmails: true,
      isGuest: false,
      ...(range && { createdAt: { gte: range.from, lt: range.to } }),
    },
    select: {
      email: true,
    },
    orderBy: {
      createdAt: 'desc',
    },
  });

  return users;
};

/**
 * Names weren't always stored in separated fName+lName format, this helper is to handle both cases.
 */
export const getUserNameById = async (
  userId: number,
): Promise<{ name: string; firstName: string; lastName: string }> => {
  const user = await client.user.findFirst({
    where: { id: userId },
    select: { name: true, firstName: true, lastName: true },
  });
  return getUserNameByUser(user);
};

/**
 * Names weren't always stored in separated format, this helper is to handle both cases.
 */
export const getUserNameByUser = async (
  user: Pick<User, 'name' | 'firstName' | 'lastName'>,
): Promise<{ name: string; firstName: string; lastName: string }> => {
  if (user.firstName) {
    return {
      name: `${user.firstName} ${user.lastName}`,
      firstName: user.firstName,
      lastName: user.lastName || '',
    };
  }
  if (user.name) {
    const firstName = user.name?.split(' ')?.[0];
    const lastName = user.name?.split(' ')?.slice(1).join(' ');
    return {
      name: user.name,
      firstName: firstName || '',
      lastName: lastName || '',
    };
  }
  return {
    name: 'User',
    firstName: 'User',
    lastName: '',
  };
};
