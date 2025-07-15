import { AccessStatus } from '@desci-labs/desci-models';
import { ActionType, Prisma } from '@prisma/client';
import { subDays } from 'date-fns';
import { Request } from 'express';

import { prisma } from '../client.js';
import { logger as parentLogger } from '../logger.js';
import { getUtcDateXDaysAgo } from '../utils/clock.js';

import { mixpanel } from './MixpanelService.js';

const logger = parentLogger.child({ module: 'Services::InteractionLog' });

interface SaveInteractionArgs {
  req: Request;
  action: ActionType;
  data: any;
  userId?: number;
  submitToMixpanel?: boolean;
}

export const saveInteraction = async ({ req, action, data, userId, submitToMixpanel }: SaveInteractionArgs) => {
  logger.info({ fn: 'saveInteractionController' }, 'interactionLog::saveInteraction');
  const user = (req as any).user;

  if (submitToMixpanel) {
    mixpanel.track(action, data);
  }

  return await prisma.interactionLog.create({
    data: {
      userId,
      ...(user?.isGuest === true || user?.isGuest === false ? { isGuest: user.isGuest } : {}), // We want null if the information isn't available
      ip: req.ip,
      userAgent: req.headers['user-agent'],
      rep: 0,
      action,
      extra: JSON.stringify(data),
    },
  });
};

interface SaveInteractionWithoutReqArgs {
  action: ActionType;
  data: any;
  userId?: number;
  submitToMixpanel?: boolean;
}

export const saveInteractionWithoutReq = async ({
  action,
  data,
  userId,
  submitToMixpanel,
}: SaveInteractionWithoutReqArgs) => {
  logger.info({ fn: 'saveInteractionController' }, 'interactionLog::saveInteraction');
  let isGuest;
  if (userId) {
    // Distinguish if the user is a guest or not
    const user = await prisma.user.findFirst({ where: { id: userId } });
    isGuest = user?.isGuest;
  }

  if (submitToMixpanel) {
    mixpanel.track(action, data);
  }

  return await prisma.interactionLog.create({
    data: { userId, isGuest, rep: 0, action, extra: JSON.stringify(data) },
  });
};

export const getUserConsent = async (userId?: number) => {
  logger.info({ fn: 'getUserConsent', userId }, 'interactionLog::getUserConsent');
  return await prisma.interactionLog.findFirst({
    where: {
      userId,
      action: ActionType.USER_TERMS_CONSENT,
    },
    // data: { userId, ip: req.ip, userAgent: req.headers['user-agent'], rep: 0, action, extra: JSON.stringify(data) },
  });
};

export const getUserQuestionnaireSubmitted = async (userId?: number) => {
  logger.info({ fn: 'getUserQuestionnaireSubmitted', userId }, 'interactionLog::getUserQuestionnaireSubmitted');
  return await prisma.interactionLog.findFirst({
    where: {
      userId,
      action: ActionType.SUBMIT_QUESTIONNAIRE,
    },
  });
};

export const getUserPublishConsent = async (userId?: number) => {
  logger.info({ fn: 'getUserPublishConsent', userId }, 'interactionLog::getUserPublishConsent');
  return await prisma.interactionLog.findMany({
    where: {
      userId,
      action: ActionType.USER_PUBLISH_CONSENT,
    },
    // data: { userId, ip: req.ip, userAgent: req.headers['user-agent'], rep: 0, action, extra: JSON.stringify(data) },
  });
};

export const getActiveUsersInXDays = async (dateXDaysAgo: Date) => {
  logger.info({ fn: 'getCountActiveUsersInXDays', dateXDaysAgo }, 'interactionLog::getCountActiveUsersInXDays');

  const res = (await prisma.$queryRaw`
    SELECT DISTINCT ON (il."userId")
      il.id,
      il.action,
      u.id as "userId",
      u.email,
      u.orcid,
      u."createdAt" as "userCreatedAt"
    FROM "InteractionLog" il
    LEFT JOIN "User" u ON il."userId" = u.id
    WHERE il."createdAt" >= ${dateXDaysAgo}
      AND il."userId" IS NOT NULL
      AND (
          --- exploring user actions ---
          extra :: jsonb -> 'action' = '"search"' :: jsonb
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
          OR extra :: jsonb -> 'action' = '"actionPublishConfirmationModalViewed"' :: jsonb
          OR extra :: jsonb -> 'action' = '"actionPublishConfirmationStepCompleted"' :: jsonb
          OR extra :: jsonb -> 'action' = '"actionPublishConfirmationStepViewed"' :: jsonb
          OR extra :: jsonb -> 'action' = '"actionPublishConfirmationStepCompleted"' :: jsonb
          OR extra :: jsonb -> 'action' = '"actionCommunityPublicationCreated"' :: jsonb
          OR extra :: jsonb -> 'action' = '"actionCoAuthorInvited"' :: jsonb
          OR extra :: jsonb -> 'action' = '"actionAiAnalyticsTabClicked"' :: jsonb
          OR extra :: jsonb -> 'action' = '"actionRelatedArticleClickedInAi"' :: jsonb
        )
      AND (il."isGuest" = false OR il."isGuest" IS NULL)
  `) as { id: number; action: string; userId: number; email: string; orcid: string; userCreatedAt: string }[];

  logger.trace({ res }, 'getActiveUsersInXDays');
  return res.map((r) => ({
    id: r.id,
    user: { id: r.userId, email: r.email, orcid: r.orcid, createdAt: r.userCreatedAt },
  }));
};

export const getCountActiveOrcidUsersInXDays = async (daysAgo: number): Promise<number> => {
  logger.info({ fn: 'getCountActiveOrcidUsersInXDays' }, 'interactionLog::getCountActiveOrcidUsersInXDays');

  const now = new Date();

  const utcMidnightXDaysAgo = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - daysAgo));

  const res = (await prisma.$queryRaw`
    SELECT DISTINCT "userId"
    FROM "InteractionLog" il
    LEFT JOIN "User" u ON u.id = "userId"
    WHERE il."createdAt" >= ${utcMidnightXDaysAgo}
      AND il."userId" IS NOT NULL
      AND u.orcid IS NOT NULL
      AND (
          --- exploring user actions ---
          extra :: jsonb -> 'action' = '"search"' :: jsonb
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
          OR extra :: jsonb -> 'action' = '"actionPublishConfirmationModalViewed"' :: jsonb
          OR extra :: jsonb -> 'action' = '"actionPublishConfirmationStepCompleted"' :: jsonb
          OR extra :: jsonb -> 'action' = '"actionPublishConfirmationStepViewed"' :: jsonb
          OR extra :: jsonb -> 'action' = '"actionPublishConfirmationStepCompleted"' :: jsonb
          OR extra :: jsonb -> 'action' = '"actionCommunityPublicationCreated"' :: jsonb
          OR extra :: jsonb -> 'action' = '"actionCoAuthorInvited"' :: jsonb
          OR extra :: jsonb -> 'action' = '"actionAiAnalyticsTabClicked"' :: jsonb
          OR extra :: jsonb -> 'action' = '"actionRelatedArticleClickedInAi"' :: jsonb
        )
      AND (il."isGuest" = false OR il."isGuest" IS NULL)
  `) as { userId: number }[];

  logger.trace({ res }, 'getCountActiveOrcidUsersInXDays');
  return res.length;
};

export const getActiveOrcidUsersInXDays = async (dateXDaysAgo: Date) => {
  logger.info({ fn: 'getActiveOrcidUsersInXDays', dateXDaysAgo }, 'interactionLog::getActiveOrcidUsersInXDays');

  const res = (await prisma.$queryRaw`
    SELECT DISTINCT ON (il."userId")
      il.id,
      il.action,
      u.id as "userId",
      u.email,
      u.orcid,
      u."createdAt" as "userCreatedAt"
    FROM "InteractionLog" il
    LEFT JOIN "User" u ON il."userId" = u.id
    WHERE il."createdAt" >= ${dateXDaysAgo}
      AND il."userId" IS NOT NULL
      AND u.orcid IS NOT NULL
      AND (
          --- exploring user actions ---
          extra :: jsonb -> 'action' = '"search"' :: jsonb
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
          OR extra :: jsonb -> 'action' = '"actionPublishConfirmationModalViewed"' :: jsonb
          OR extra :: jsonb -> 'action' = '"actionPublishConfirmationStepCompleted"' :: jsonb
          OR extra :: jsonb -> 'action' = '"actionPublishConfirmationStepViewed"' :: jsonb
          OR extra :: jsonb -> 'action' = '"actionPublishConfirmationStepCompleted"' :: jsonb
          OR extra :: jsonb -> 'action' = '"actionCommunityPublicationCreated"' :: jsonb
          OR extra :: jsonb -> 'action' = '"actionCoAuthorInvited"' :: jsonb
          OR extra :: jsonb -> 'action' = '"actionAiAnalyticsTabClicked"' :: jsonb
          OR extra :: jsonb -> 'action' = '"actionRelatedArticleClickedInAi"' :: jsonb
        )
      AND (il."isGuest" = false OR il."isGuest" IS NULL)
  `) as { id: number; action: string; userId: number; email: string; orcid: string; userCreatedAt: string }[];

  return res.map((r) => ({
    id: r.id,
    user: { id: r.userId, email: r.email, orcid: r.orcid, createdAt: r.userCreatedAt },
  }));
};

export const getCountActiveUsersInMonth = async (month: number, year: number): Promise<number> => {
  logger.info({ fn: 'getCountActiveUsersInMonth' }, 'interactionLog::getCountActiveUsersInMonth');

  const activeCount = await prisma.interactionLog.findMany({
    distinct: ['userId'],
    where: {
      OR: [{ isGuest: false }, { isGuest: null }],
      createdAt: {
        gte: new Date(year, month, 1),
        lt: new Date(year, month + 1, 1),
      },
      // this is necessary to filter out 'USER_ACTION' interactions saved in orcidNext
      // from poluting returned data
      // userId: {
      //   not: null,
      // },
    },
  });
  return activeCount.length;
};

export const getCountActiveOrcidUsersInMonth = async (month: number, year: number): Promise<number> => {
  logger.info({ fn: 'getCountActiveOrcidUsersInMonth' }, 'interactionLog::getCountActiveOrcidUsersInMonth');

  const activeCount = await prisma.interactionLog.findMany({
    distinct: ['userId'],
    where: {
      createdAt: {
        gte: new Date(year, month, 1),
        lt: new Date(year, month + 1, 1),
      },
      user: {
        orcid: {
          not: null,
        },
      },
    },
  });
  return activeCount.length;
};

export const getEmailsActiveUsersInXDays = async (daysAgo: number): Promise<string[]> => {
  logger.info({ fn: 'getEmailsActiveUsersInXDays' }, 'interactionLog::getEmailsActiveUsersInXDays');

  const utcMidnightXDaysAgo = getUtcDateXDaysAgo(daysAgo);

  const activeUsers = await prisma.interactionLog.findMany({
    distinct: ['userId'],
    include: {
      user: true,
    },
    where: {
      createdAt: {
        gte: utcMidnightXDaysAgo,
      },
      // this is necessary to filter out 'USER_ACTION' interactions saved in orcidNext
      // from poluting returned data
      // userId: {
      //   not: null,
      // },
    },
  });
  return activeUsers.filter((a) => a.user).map((a) => a.user.email);
};

export const getNodeViewsInXDays = async (daysAgo: number): Promise<number> => {
  logger.info({ fn: 'getNodeViewsInXDays' }, 'interactionLog::getNodeViewsInXDays');

  const utcMidnightXDaysAgo = getUtcDateXDaysAgo(daysAgo);
  const res =
    await prisma.$queryRaw`select count(1) as count from "InteractionLog" z where action = 'USER_ACTION' and extra::jsonb->'action' = '"viewedNode"'::jsonb and "createdAt" >= ${utcMidnightXDaysAgo}`;
  const count = (res as any[])[0].count.toString();
  return parseInt(count);
};

export const getNodeViewsInMonth = async (month: number, year: number): Promise<number> => {
  logger.info({ fn: 'getNodeViewsInMonth' }, 'interactionLog::getNodeViewsInMonth');
  const res =
    await prisma.$queryRaw`select count(1) as count from "InteractionLog" z where action = 'USER_ACTION' and extra::jsonb->'action' = '"viewedNode"'::jsonb and "createdAt" >= ${new Date(
      year,
      month,
      1,
    )} and "createdAt" < ${new Date(year, month + 1, 1)}`;
  const count = (res as any[])[0].count.toString();
  return parseInt(count);
};

/**
 * Minimal Data query methods with range arguments
 */

export const getActiveUsersInRange = async (range: { from: Date; to: Date }) => {
  const res = (await prisma.$queryRaw`
    SELECT DISTINCT ON (il."userId") 
      il."createdAt",
      u.id as "userId"
    FROM "InteractionLog" il
    LEFT JOIN "User" u ON u.id = il."userId" 
    WHERE il."createdAt" >= ${range.from}
      AND il."createdAt" <= ${range.to}
      AND il."userId" IS NOT NULL
      AND (il."isGuest" = false OR il."isGuest" IS NULL)
      AND (
          --- exploring user actions ---
          extra :: jsonb -> 'action' = '"search"' :: jsonb
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
          OR extra :: jsonb -> 'action' = '"actionPublishConfirmationModalViewed"' :: jsonb
          OR extra :: jsonb -> 'action' = '"actionPublishConfirmationStepCompleted"' :: jsonb
          OR extra :: jsonb -> 'action' = '"actionPublishConfirmationStepViewed"' :: jsonb
          OR extra :: jsonb -> 'action' = '"actionPublishConfirmationStepCompleted"' :: jsonb
          OR extra :: jsonb -> 'action' = '"actionCommunityPublicationCreated"' :: jsonb
          OR extra :: jsonb -> 'action' = '"actionCoAuthorInvited"' :: jsonb
          OR extra :: jsonb -> 'action' = '"actionAiAnalyticsTabClicked"' :: jsonb
          OR extra :: jsonb -> 'action' = '"actionRelatedArticleClickedInAi"' :: jsonb
        )
  `) as { createdAt: string; userId: number }[];

  logger.trace({ res }, 'getActiveUsersInRange');
  return res;
};

export const getActiveOrcidUsersInRange = async (range: { from: Date; to: Date }) => {
  logger.trace({ fn: 'getActiveOrcidUsersInRange' }, 'user::getActiveOrcidUsersInRange');

  const res = (await prisma.$queryRaw`
    SELECT DISTINCT ON (il."userId") 
      il."createdAt",
      u.id as "userId"
    FROM "InteractionLog" il
    LEFT JOIN "User" u ON u.id = il."userId" 
    WHERE il."createdAt" >= ${range.from}
      AND il."createdAt" < ${range.to}
      AND il."userId" IS NOT NULL
      AND u.orcid IS NOT NULL
      AND (il."isGuest" = false OR il."isGuest" IS NULL)
      AND (
          --- exploring user actions ---
          extra :: jsonb -> 'action' = '"search"' :: jsonb
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
          OR extra :: jsonb -> 'action' = '"actionPublishConfirmationModalViewed"' :: jsonb
          OR extra :: jsonb -> 'action' = '"actionPublishConfirmationStepCompleted"' :: jsonb
          OR extra :: jsonb -> 'action' = '"actionPublishConfirmationStepViewed"' :: jsonb
          OR extra :: jsonb -> 'action' = '"actionPublishConfirmationStepCompleted"' :: jsonb
          OR extra :: jsonb -> 'action' = '"actionCommunityPublicationCreated"' :: jsonb
          OR extra :: jsonb -> 'action' = '"actionCoAuthorInvited"' :: jsonb
          OR extra :: jsonb -> 'action' = '"actionAiAnalyticsTabClicked"' :: jsonb
          OR extra :: jsonb -> 'action' = '"actionRelatedArticleClickedInAi"' :: jsonb
        )
  `) as { createdAt: string; userId: number }[];

  logger.trace({ res }, 'getActiveOrcidUsersInRange');
  return res;
};

export const getNodeViewsInRange = async (range: { from: Date; to: Date }) => {
  // logger.info({ fn: 'getNodeViewsInRange' }, 'interactionLog::getNodeViewsInRange');
  const res =
    await prisma.$queryRaw`select "createdAt" from "InteractionLog" z where action = 'USER_ACTION' and extra::jsonb->'action' = '"viewedNode"'::jsonb and "createdAt" >= ${range.from} and "createdAt" < ${range.to}`;
  return res as { createdAt: string }[];
};

export const getBadgeVerificationsInRange = async (range: { from: Date; to: Date }) => {
  // logger.info({ fn: 'getBadgeVerificationsInRange' }, 'interactionLog::getBadgeVerificationsInRange');
  const res =
    await prisma.$queryRaw`select "createdAt" from "InteractionLog" z where action = 'VERIFY_ATTESTATION' and "createdAt" >= ${range.from} and "createdAt" < ${range.to}`;
  return res as { createdAt: string }[];
};

export const getBadgeVerificationsCountInRange = async (range: { from: Date; to: Date }) => {
  return prisma.interactionLog.count({
    where: { action: ActionType.VERIFY_ATTESTATION, createdAt: { gte: range.from, lt: range.to } },
  });
};

export const getDownloadedBytesInRange = async (range: { from: Date; to: Date }) => {
  // logger.info({ fn: 'getDownloadedBytesInRange', range }, 'interactionLog::getDownloadedBytesInRange');
  const res =
    (await prisma.$queryRaw`select "extra", "createdAt" from "InteractionLog" z where action = 'USER_ACTION' and extra::jsonb->'action' = '"ctxDriveDownload"'::jsonb and "createdAt" >= ${range.from} and "createdAt" < ${range.to}`) as {
      createdAt: string;
      extra: string;
    }[];
  const data = res.map((entry) => {
    const extra = JSON.parse(entry.extra) as {
      message: string;
    };
    const message = JSON.parse(extra.message) as {
      size: number;
      cid: string;
      external: boolean;
      accessStatus: AccessStatus;
    };

    logger.info({ entry, extra, message }, 'getDownloadedBytesInRange');
    return { createdAt: entry.createdAt, size: message.size };
  });
  logger.info({ data }, 'getDownloadedBytesInRange');

  return data;
};

export const getDownloadedBytesInXDays = async (daysAgo: number) => {
  // const dateXDaysAgo = new Date(new Date().getTime() - daysAgo * 24 * 60 * 60 * 1000);
  const from = subDays(new Date(), daysAgo);
  const to = new Date();
  logger.info({ fn: 'getDownloadedBytesInXDays', daysAgo, from, to }, 'interactionLog::getDownloadedBytesInXDays');

  const res =
    (await prisma.$queryRaw`select "extra", "createdAt" from "InteractionLog" z where action = 'USER_ACTION' and extra::jsonb->'action' = '"ctxDriveDownload"'::jsonb and "createdAt" >= ${from} and "createdAt" < ${to}`) as {
      createdAt: string;
      extra: string;
    }[];

  const bytes = res
    .map((entry) => {
      const extra = JSON.parse(entry.extra) as {
        message: string;
      };
      const message = JSON.parse(extra.message) as {
        size: number;
        cid: string;
        external: boolean;
        accessStatus: AccessStatus;
      };

      return { createdAt: entry.createdAt, size: message.size };
    })
    .reduce((total, entry) => (total += entry.size), 0);
  logger.info({ bytes }, 'getDownloadedBytesInXDays');

  return bytes;
};
