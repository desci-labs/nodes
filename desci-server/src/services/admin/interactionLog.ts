import { Prisma } from '@prisma/client';

import { prisma } from '../../client.js';
import { IS_PRODUCTION } from '../../config/index.js';
import { logger } from '../../logger.js';
import { getUtcDateXDaysAgo } from '../../utils/clock.js';

/**
 * Count the number of active users in the last `daysAgo` days.
 * @param daysAgo - The number of days to count active users for.
 * @returns The number of active users in the last `daysAgo` days.
 */
export const getCountActiveUsersInXDays = async (daysAgo: number): Promise<number> => {
  logger.info({ fn: 'getCountActiveUsersInXDays' }, 'interactionLog::getCountActiveUsersInXDays');

  const utcMidnightXDaysAgo = getUtcDateXDaysAgo(daysAgo);

  const res = (await prisma.$queryRaw`
    SELECT
      count(DISTINCT "userId")::integer
    FROM
        "InteractionLog" z
        LEFT JOIN "User" usr ON usr.id = "userId"
    WHERE
        ACTION = 'USER_ACTION'
        AND "userId" IS NOT NULL
        AND z."createdAt" >= ${utcMidnightXDaysAgo}
        AND (usr."isGuest" = false OR usr."isGuest" IS NULL)
        AND (
          --- exploring user actions ---
          extra :: jsonb -> 'action' = '"search"' :: jsonb
          OR extra :: jsonb -> 'action' = '"viewedNode"' :: jsonb
          OR extra :: jsonb -> 'action' = '"actionSearchResultClicked"' :: jsonb
          OR extra :: jsonb -> 'action' = '"actionSearchPerformed"' :: jsonb
          OR extra :: jsonb -> 'action' = '"actionSearchBarUsed"' :: jsonb
          OR extra :: jsonb -> 'action' = '"actionAuthorProfileViewed"' :: jsonb
          OR extra :: jsonb -> 'action' = '"btnSidebarNavigation"' :: jsonb
          OR extra :: jsonb -> 'action' = '"actionRelatedArticleClickedInAi"' :: jsonb 
          --- publishing user actions ---
          OR extra :: jsonb -> 'action' = '"actionResearchObjectCreated"' :: jsonb
          OR extra :: jsonb -> 'action' = '"actionResearchObjectUpdated"' :: jsonb
          OR extra :: jsonb -> 'action' = '"actionResearchObjectShared"' :: jsonb
          OR extra :: jsonb -> 'action' = '"actionResearchObjectPublished"' :: jsonb
          OR extra :: jsonb -> 'action' = '"actionPublishResearchObjectInitiated"' :: jsonb
          OR extra :: jsonb -> 'action' = '"actionCommunityPublicationCreated"' :: jsonb
          OR extra :: jsonb -> 'action' = '"actionCoAuthorInvited"' :: jsonb
          OR extra :: jsonb -> 'action' = '"actionAiAnalyticsTabClicked"' :: jsonb
          OR extra :: jsonb -> 'action' = '"actionRelatedArticleClickedInAi"' :: jsonb
        )
        ${IS_PRODUCTION ? Prisma.sql`AND usr.email NOT LIKE '%desci.com%'` : Prisma.sql``}
    `) as {
    count: number;
  }[];

  logger.trace({ res, utcMidnightXDaysAgo }, 'getCountActiveUsersInXDays');
  return Number(res[0]?.count || 0);
};

/**
 * Count the number of users who have explored the app within an optional time range.
 * @param range - The time range to count exploring users for.
 * @returns The number of users who have explored the app within the time range.
 */
export const countExploringUsersInRange = async (range: { from: Date; to: Date }): Promise<number> => {
  logger.trace({ fn: 'countExploringUsersInRange' }, 'interactionLog::countExploringUsersInRange');

  const res = (await prisma.$queryRaw`
    SELECT
        count(distinct "userId")
    FROM
        "InteractionLog" z
    LEFT JOIN "User" usr ON usr.id = "userId"
    WHERE
        ACTION = 'USER_ACTION'
        AND "userId" IS NOT NULL
        AND (
            extra :: jsonb -> 'action' = '"search"' :: jsonb
            OR extra :: jsonb -> 'action' = '"viewedNode"' :: jsonb
            OR  extra :: jsonb -> 'action' = '"actionSearchResultClicked"' :: jsonb
            OR  extra :: jsonb -> 'action' = '"actionSearchPerformed"' :: jsonb
            OR  extra :: jsonb -> 'action' = '"actionSearchBarUsed"' :: jsonb
            OR  extra :: jsonb -> 'action' = '"actionAuthorProfileViewed"' :: jsonb
            OR  extra :: jsonb -> 'action' = '"btnSidebarNavigation"' :: jsonb
            OR  extra :: jsonb -> 'action' = '"actionRelatedLinkClicked"' :: jsonb
        ) and z."createdAt" >= ${range.from} and z."createdAt" <= ${range.to}
        ${IS_PRODUCTION ? Prisma.sql`AND usr.email NOT LIKE '%desci.com%'` : Prisma.sql``}
        `) as {
    count: number;
  }[];

  logger.trace({ res }, 'countExploringUsersInRange');
  return Number(res[0]?.count || 0);
};

/**
 * Count the number of users who have explored the app within an optional time range.
 * @param range - The time range to count exploring users for.
 * @returns The number of users who have explored the app within the time range.
 */
export const countPublishingUsersInRange = async (range: { from: Date; to: Date }): Promise<number> => {
  logger.trace({ fn: 'countPublishingUsersInRange' }, 'interactionLog::countPublishingUsersInRange');

  const res = (await prisma.$queryRaw`
    SELECT
        count(distinct "userId")
    FROM
        "InteractionLog" z
    LEFT JOIN "User" usr ON usr.id = "userId"
    WHERE
        ACTION = 'USER_ACTION'
        AND "userId" IS NOT NULL
        AND (
            extra :: jsonb -> 'action' = '"actionResearchObjectCreated"' :: jsonb
            OR  extra :: jsonb -> 'action' = '"actionResearchObjectUpdated"' :: jsonb
            OR  extra :: jsonb -> 'action' = '"actionResearchObjectShared"' :: jsonb
            OR  extra :: jsonb -> 'action' = '"actionResearchObjectPublished"' :: jsonb
            OR  extra :: jsonb -> 'action' = '"actionPublishResearchObjectInitiated"' :: jsonb
            OR  extra :: jsonb -> 'action' = '"actionCommunityPublicationCreated"' :: jsonb
            OR  extra :: jsonb -> 'action' = '"actionCoAuthorInvited"' :: jsonb
            OR  extra :: jsonb -> 'action' = '"actionAiAnalyticsTabClicked"' :: jsonb
            OR  extra :: jsonb -> 'action' = '"actionRelatedArticleClickedInAi"' :: jsonb
        ) and z."createdAt" >= ${range.from} and z."createdAt" <= ${range.to}
        ${IS_PRODUCTION ? Prisma.sql`AND usr.email NOT LIKE '%desci.com%'` : Prisma.sql``}
        `) as {
    count: number;
  }[];

  logger.trace({ res }, 'countExploringUsersInRange');
  return Number(res[0]?.count || 0);
};

/**
 * Count the number of users who have updated a research object.
 * @returns The number of users who have updated a research object.
 */
export const countResearchObjectsUpdated = async () => {
  logger.trace({ fn: 'countResearchObjectsUpdated' }, 'interactionLog::countResearchObjectsUpdated');

  const res = (await prisma.$queryRaw`
    SELECT
        count(distinct "userId")
    FROM
        "InteractionLog" z
    WHERE
        ACTION = 'USER_ACTION'
        AND "userId" IS NOT NULL
        AND (
            extra :: jsonb -> 'action' = '"actionResearchObjectUpdated"' :: jsonb
        )`) as {
    count: number;
  }[];

  logger.trace({ res }, 'countResearchObjectsUpdated');
  return Number(res[0]?.count || 0);
};

/**
 * Count the number of users who have shared a research object.
 * @returns The number of users who have shared a research object.
 */
export const countResearchObjectsShared = async () => {
  logger.trace({ fn: 'countResearchObjectsShared' }, 'interactionLog::countResearchObjectsShared');

  const res = (await prisma.$queryRaw`
    SELECT
        count(distinct "userId")
    FROM
        "InteractionLog" z
    WHERE
        ACTION = 'USER_ACTION'
        AND "userId" IS NOT NULL
        AND extra :: jsonb -> 'action' = '"actionResearchObjectShared"' :: jsonb
        `) as {
    count: number;
  }[];

  logger.trace({ res }, 'countResearchObjectsShared');
  return Number(res[0]?.count || 0);
};

/**
 * Calculate the retention of users who have signed up and returned to the app within the last `days` days.
 * @param days - The number of days to get the retention for.
 * @returns The number of users who have signed up and returned to the app within the last `days` days.
 */
export const getUserRetention = async (days: number) => {
  logger.trace({ fn: 'getUserRetention' }, 'interactionLog::getUserRetention');

  const res = (await prisma.$queryRaw`
    SELECT
      count(DISTINCT "userId")::integer 
    FROM
        "InteractionLog" z
        LEFT JOIN "User" usr ON usr.id = "userId"    
    WHERE
        ACTION = 'USER_ACTION'
        AND "userId" IS NOT NULL
        AND (
            extra :: jsonb -> 'action' != '"actionSignInCompleted"' :: jsonb
            AND extra :: jsonb -> 'action' != '"actionUserSignedUp"' :: jsonb
            AND extra :: jsonb -> 'action' != '"actionSignInPageViewed"' :: jsonb
        )
        AND (
            EXTRACT(
                EPOCH
                FROM
                    (z."createdAt" - usr."createdAt")
            ) / 86400
        ) < ${days}
        ${IS_PRODUCTION ? Prisma.sql`AND usr.email NOT LIKE '%desci.com%'` : Prisma.sql``}
      ;`) as {
    count: number;
  }[];

  return Number(res[0]?.count || 0);
};

// function to count Interactions related to sharing research objects within an optional time range\
/**
 * Count the number of interactions related to sharing research objects within an optional time range.
 * @param range - The time range to count interactions for.
 * @returns The number of interactions related to sharing research objects within the time range.
 */
export const countResearchObjectSharedLogs = async (range?: { from: Date; to: Date }) => {
  const from = range?.from || Prisma.raw('to_timestamp(0)');
  const to = range?.to || Prisma.raw('to_timestamp(extract(epoch from now()))');
  const count = await prisma.$queryRaw`
      SELECT
        count(*)::integer
      FROM
          "InteractionLog" z
          LEFT JOIN "User" usr ON usr.id = "userId"
      WHERE
          ACTION = 'USER_ACTION'
          AND "userId" IS NOT NULL
          AND (
              extra :: jsonb -> 'action' = '"actionResearchObjectShared"' :: jsonb
              OR extra :: jsonb -> 'action' = '"btnShare"' :: jsonb
              OR extra :: jsonb -> 'action' = '"clickedShareYourResearch"' :: jsonb
          )
          AND z."createdAt" >= ${from} 
          AND z."createdAt" <= ${to}
          ${IS_PRODUCTION ? Prisma.sql`AND usr.email NOT LIKE '%desci.com%'` : Prisma.sql``}
      ;`;
  return Number(count[0].count);
};

/**
 * Count the number of interactions related to co-author invitations within an optional time range.
 * @param range - The time range to count interactions for.
 * @returns The number of interactions related to co-author invitations within the time range.
 */
export const countCoAuthorInvitations = async (range?: { from: Date; to: Date }) => {
  const from = range?.from || Prisma.raw('to_timestamp(0)');
  const to = range?.to || Prisma.raw('to_timestamp(extract(epoch from now()))');
  const count = await prisma.$queryRaw`
      SELECT
        count(*)::integer
      FROM
          "InteractionLog" z
          LEFT JOIN "User" usr ON usr.id = "userId"
      WHERE
        ACTION = 'USER_ACTION'
        AND "userId" IS NOT NULL
        AND (
            extra :: jsonb -> 'action' = '"actionCoAuthorInvited"' :: jsonb
        )
        AND z."createdAt" >= ${from} 
        AND z."createdAt" <= ${to}
        ${IS_PRODUCTION ? Prisma.sql`AND usr.email NOT LIKE '%desci.com%'` : Prisma.sql``}
      ;`;
  return Number(count[0].count);
};

/**
 * Count the number of interactions related to AI analytics tabs clicks within an optional time range.
 * @param range - The time range to count interactions for.
 * @returns The number of interactions related to AI analytics tabs clicks within the time range.
 */
export const countAiAnalyticsTabsClicks = async (range?: { from: Date; to: Date }) => {
  const from = range?.from || Prisma.raw('to_timestamp(0)');
  const to = range?.to || Prisma.raw('to_timestamp(extract(epoch from now()))');
  const count = await prisma.$queryRaw`
      SELECT
        count(*)::integer
      FROM
          "InteractionLog" z
          LEFT JOIN "User" usr ON usr.id = "userId"
      WHERE
        ACTION = 'USER_ACTION'
        AND "userId" IS NOT NULL
        AND (
            extra :: jsonb -> 'action' = '"actionAiAnalyticsTabClicked"' :: jsonb
        )
        AND z."createdAt" >= ${from} 
        AND z."createdAt" <= ${to}
        ${IS_PRODUCTION ? Prisma.sql`AND usr.email NOT LIKE '%desci.com%'` : Prisma.sql``}
      ;`;
  return Number(count[0]?.count || 0);
};

/**
 * Count the number of interactions related to closely matched articles in Ai analytics clicked within an optional time range.
 * @param range - The time range to count interactions for.
 * @returns The number of interactions related to closely matched articles in Ai analytics clicked within the time range.
 */
export const countRelatedArticleClickedInAiAnalytics = async (range?: { from: Date; to: Date }) => {
  const from = range?.from || Prisma.raw('to_timestamp(0)');
  const to = range?.to || Prisma.raw('to_timestamp(extract(epoch from now()))');
  const count = await prisma.$queryRaw`
      SELECT
        count(*)::integer
      FROM
          "InteractionLog" z
          LEFT JOIN "User" usr ON usr.id = "userId"
      WHERE
        ACTION = 'USER_ACTION'
        AND "userId" IS NOT NULL
        AND (
            extra :: jsonb -> 'action' = '"actionRelatedArticleClickedInAi"' :: jsonb
        )
        AND z."createdAt" >= ${from} 
        AND z."createdAt" <= ${to}
        ${IS_PRODUCTION ? Prisma.sql`AND usr.email NOT LIKE '%desci.com%'` : Prisma.sql``}
      ;`;
  return Number(count[0]?.count || 0);
};

/**
 * Count the number of interactions related to closely matched articles in Ai analytics clicked within an optional time range.
 * @param range - The time range to count interactions for.
 * @returns The number of interactions related to closely matched articles in Ai analytics clicked within the time range.
 */
export const countClaimedBadgesLogs = async (range?: { from: Date; to: Date }) => {
  const from = range?.from || Prisma.raw('to_timestamp(0)');
  const to = range?.to || Prisma.raw('to_timestamp(extract(epoch from now()))');
  const count = await prisma.$queryRaw`
      SELECT
        count(*)::integer
      FROM
          "InteractionLog" z
          LEFT JOIN "User" usr ON usr.id = "userId"
      WHERE
        ACTION = 'CLAIM_ATTESTATION'
        AND "userId" IS NOT NULL
        AND z."createdAt" >= ${from} 
        AND z."createdAt" <= ${to}
        ${IS_PRODUCTION ? Prisma.sql`AND usr.email NOT LIKE '%desci.com%'` : Prisma.sql``}
      ;`;
  return Number(count[0]?.count || 0);
};

/**
 * Count the number of interactions related to guest mode visits within an optional time range.
 * @param range - The time range to count interactions for.
 * @returns The number of interactions related to guest mode visits within the time range.
 */
export const countGuestModeVisits = async (range?: { from: Date; to: Date }) => {
  return await prisma.user.count({
    where: {
      ...(range && { createdAt: { gte: range.from, lt: range.to } }),
      OR: [{ isGuest: true }, { convertedGuest: true }],
    },
  });
};

/**
 * Count the number of interactions related to profile views within an optional time range.
 * @param range - The time range to count interactions for.
 * @returns The number of interactions related to profile views within the time range.
 */
export const countProfileViews = async (range?: { from: Date; to: Date }) => {
  const from = range?.from || Prisma.raw('to_timestamp(0)');
  const to = range?.to || Prisma.raw('to_timestamp(extract(epoch from now()))');
  const count = await prisma.$queryRaw`
      SELECT
        count(*)::integer
      FROM
          "InteractionLog" z
          LEFT JOIN "User" usr ON usr.id = "userId"
      WHERE
        ACTION = 'USER_ACTION'
        AND "userId" IS NOT NULL
        AND (
            extra :: jsonb -> 'action' = '"actionAuthorProfileViewed"' :: jsonb
        )
        AND z."createdAt" >= ${from} 
        AND z."createdAt" <= ${to}
        ${IS_PRODUCTION ? Prisma.sql`AND usr.email NOT LIKE '%desci.com%'` : Prisma.sql``}
      ;`;
  return Number(count[0]?.count || 0);
};
