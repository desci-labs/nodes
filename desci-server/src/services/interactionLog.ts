import { AccessStatus } from '@desci-labs/desci-models';
import { ActionType } from '@prisma/client';
import { subDays } from 'date-fn-latest';
import { Request } from 'express';

import { prisma } from '../client.js';
import { logger as parentLogger } from '../logger.js';
import { getUtcDateXDaysAgo } from '../utils/clock.js';

const logger = parentLogger.child({ module: 'Services::InteractionLog' });

export const saveInteraction = async (req: Request, action: ActionType, data: any, userId?: number) => {
  logger.info({ fn: 'saveInteractionController' }, 'interactionLog::saveInteraction');
  const user = (req as any).user;
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

export const saveInteractionWithoutReq = async (action: ActionType, data: any, userId?: number) => {
  logger.info({ fn: 'saveInteractionController' }, 'interactionLog::saveInteraction');
  let isGuest;
  if (userId) {
    // Distinguish if the user is a guest or not
    const user = await prisma.user.findFirst({ where: { id: userId } });
    isGuest = user?.isGuest;
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

export const getCountActiveUsersInXDays = async (daysAgo: number): Promise<number> => {
  logger.info({ fn: 'getCountActiveUsersInXDays' }, 'interactionLog::getCountActiveUsersInXDays');

  const now = new Date();

  const utcMidnightXDaysAgo = getUtcDateXDaysAgo(daysAgo);
  return (
    await prisma.interactionLog.findMany({
      distinct: ['userId'],
      where: {
        createdAt: {
          gte: utcMidnightXDaysAgo,
        },
        OR: [{ isGuest: false }, { isGuest: null }],
        // this is necessary to filter out 'USER_ACTION' interactions saved in orcidNext
        // from poluting returned data
        userId: {
          not: null,
        },
      },
    })
  ).length;
};

export const getActiveUsersInXDays = async (dateXDaysAgo: Date) => {
  logger.info({ fn: 'getCountActiveUsersInXDays', dateXDaysAgo }, 'interactionLog::getCountActiveUsersInXDays');

  return await prisma.interactionLog.findMany({
    distinct: ['userId'],

    where: {
      createdAt: {
        gte: dateXDaysAgo,
      },
      // this is necessary to filter out 'USER_ACTION' interactions saved in orcidNext
      // from poluting returned data
      userId: {
        not: null,
      },
      OR: [{ isGuest: false }, { isGuest: null }],
    },
    select: { id: true, action: true, user: { select: { id: true, email: true, orcid: true } } },
  });
};

export const getCountActiveOrcidUsersInXDays = async (daysAgo: number): Promise<number> => {
  logger.info({ fn: 'getCountActiveOrcidUsersInXDays' }, 'interactionLog::getCountActiveOrcidUsersInXDays');

  const now = new Date();

  const utcMidnightXDaysAgo = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - daysAgo));
  return (
    await prisma.interactionLog.findMany({
      distinct: ['userId'],
      where: {
        createdAt: {
          gte: utcMidnightXDaysAgo,
        },
        user: {
          orcid: {
            not: null,
          },
        },
      },
    })
  ).length;
};

export const getActiveOrcidUsersInXDays = async (dateXDaysAgo: Date) => {
  logger.info({ fn: 'getActiveOrcidUsersInXDays', dateXDaysAgo }, 'interactionLog::getActiveOrcidUsersInXDays');
  return await prisma.interactionLog.findMany({
    distinct: ['userId'],
    where: {
      createdAt: {
        gte: dateXDaysAgo,
      },
      user: {
        orcid: {
          not: null,
        },
      },
    },
    select: { user: { select: { id: true, email: true, orcid: true } } },
    // include: { user: { select: { id: true, email: true, orcid: true } } },
  });
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
  logger.trace({ fn: 'getNewUsersInRange' }, 'user::getNewUsersInRange');

  return await prisma.interactionLog.findMany({
    distinct: ['userId'],
    where: {
      createdAt: {
        gte: range.from,
        lt: range.to,
      },
      // this is necessary to filter out 'USER_ACTION' interactions saved in orcidNext
      // from poluting returned data
      userId: {
        not: null,
      },
      OR: [{ isGuest: false }, { isGuest: null }],
    },
    select: { user: { select: { createdAt: true } } },
  });
};

export const getActiveOrcidUsersInRange = async (range: { from: Date; to: Date }) => {
  logger.trace({ fn: 'getActiveOrcidUsersInRange' }, 'user::getActiveOrcidUsersInRange');

  return await prisma.interactionLog.findMany({
    distinct: ['userId'],
    where: {
      createdAt: {
        gte: range.from,
        lt: range.to,
      },
      user: {
        orcid: {
          not: null,
        },
      },
    },
    select: { user: { select: { createdAt: true } } },
  });
};

export const getNodeViewsInRange = async (range: { from: Date; to: Date }) => {
  logger.info({ fn: 'getNodeViewsInRange' }, 'interactionLog::getNodeViewsInRange');
  const res =
    await prisma.$queryRaw`select "createdAt" from "InteractionLog" z where action = 'USER_ACTION' and extra::jsonb->'action' = '"viewedNode"'::jsonb and "createdAt" >= ${range.from} and "createdAt" < ${range.to}`;
  return res as { createdAt: string }[];
};

export const getDownloadedBytesInRange = async (range: { from: Date; to: Date }) => {
  logger.info({ fn: 'getDownloadedBytesInRange', range }, 'interactionLog::getDownloadedBytesInRange');
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
