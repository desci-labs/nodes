import { User } from '@prisma/client';
import { differenceInDays, subDays, interval, eachDayOfInterval, isSameDay } from 'date-fn-latest';
import { Request, Response } from 'express';
import _ from 'lodash';
import zod from 'zod';

import { SuccessResponse } from '../../core/ApiResponse.js';
import { logger as parentLogger } from '../../logger.js';
import { RequestWithUser } from '../../middleware/authorisation.js';
import { crossRefClient } from '../../services/index.js';
import {
  getActiveOrcidUsersInRange,
  getActiveOrcidUsersInXDays,
  getActiveUsersInRange,
  getActiveUsersInXDays,
  getCountActiveOrcidUsersInMonth,
  getCountActiveOrcidUsersInXDays,
  getCountActiveUsersInMonth,
  getCountActiveUsersInXDays,
  getNodeViewsInMonth,
  getNodeViewsInRange,
  getNodeViewsInXDays,
} from '../../services/interactionLog.js';
import {
  getCountNewNodesInXDays,
  getBytesInXDays,
  getCountNewNodesInMonth,
  getBytesInMonth,
  getNewNodesInRange,
  getBytesInRange,
} from '../../services/nodeManager.js';
import {
  getCountAllOrcidUsers,
  getCountAllUsers,
  getCountNewOrcidUsersInXDays,
  getCountNewUsersInMonth,
  getCountNewUsersInXDays,
  getCountNewUsersWithOrcidInMonth,
  getNewOrcidUsersInRange,
  getNewOrcidUsersInXDays,
  getNewUsersInRange,
  getNewUsersInXDays,
} from '../../services/user.js';
import { asyncMap } from '../../utils.js';

const logger = parentLogger.child({ module: 'ADMIN::AnalyticsController' });

// create a csv with the following fields for each month
// new users(orcid), active users(orcid), new nodes, node views, bytes uploaded
export const createCsv = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user as User;
    logger.info({ fn: 'createCsv' }, `GET createCsv called by ${user.email}`);

    // start month is 12 months ago
    const endYear = new Date().getFullYear();
    const endMonth = new Date().getMonth();
    let curYear = endYear - 1;
    let curMonth = endMonth;
    let monthsCovered = 0;
    interface DataRow {
      month: string;
      year: string;
      newUsers: string;
      newOrcidUsers: string;
      activeUsers: string;
      activeOrcidUsers: string;
      newNodes: number;
      nodeViews: number;
      bytesUploaded: number;
    }
    const data: DataRow[] = [];
    while (monthsCovered <= 12) {
      const newUsers = await getCountNewUsersInMonth(curMonth, curYear);
      const newOrcidUsers = await getCountNewUsersWithOrcidInMonth(curMonth, curYear);
      const activeUsers = await getCountActiveUsersInMonth(curMonth, curYear);
      const activeOrcidUsers = await getCountActiveOrcidUsersInMonth(curMonth, curYear);
      const newNodes = await getCountNewNodesInMonth(curMonth, curYear);
      const nodeViews = await getNodeViewsInMonth(curMonth, curYear);
      const bytesUploaded = await getBytesInMonth(curMonth, curYear);

      data.push({
        month: (curMonth + 1).toString(),
        year: curYear.toString(),
        newUsers: newUsers.toString(),
        newOrcidUsers: newOrcidUsers.toString(),
        activeUsers: activeUsers.toString(),
        activeOrcidUsers: activeOrcidUsers.toString(),
        newNodes,
        nodeViews,
        bytesUploaded,
      });
      curMonth++;
      if (curMonth > 11) {
        curYear++;
        curMonth = 0;
      }
      monthsCovered++;
    }
    // export data to csv

    const csv = [
      'month,year,newUsers,newOrcidUsers,activeUsers,activeOrcidUsers,newNodes,nodeViews,bytesUploaded',
      ...data
        .reverse()
        .map((row) =>
          [
            row.month,
            row.year,
            row.newUsers,
            row.newOrcidUsers,
            row.activeUsers,
            row.activeOrcidUsers,
            row.newNodes,
            row.nodeViews,
            row.bytesUploaded,
          ].join(','),
        ),
    ].join('\n');
    res.setHeader('Content-disposition', 'attachment; filename=analytics.csv');
    res.set('Content-Type', 'text/csv');
    res.status(200).send(csv);
  } catch (error) {
    logger.error({ fn: 'createCsv', error }, 'Failed to GET createCsv');
    res.sendStatus(500);
  }
};

export const getAnalytics = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user as User;
    logger.info({ fn: 'getAnalytics' }, `GET getAnalytics called by ${user.email}`);

    logger.trace({ fn: 'getAnalytics' }, 'Fetching new users');
    const newUsersInLast30Days = await getCountNewUsersInXDays(30);
    const newUsersInLast7Days = await getCountNewUsersInXDays(7);
    const newUsersToday = await getCountNewUsersInXDays(1);

    const allUsers = await getCountAllUsers();
    const allExternalUsers = await getCountAllUsers();
    const allOrcidUsers = await getCountAllOrcidUsers();

    const newOrcidUsersInLast30Days = await getCountNewOrcidUsersInXDays(30);
    const newOrcidUsersInLast7Days = await getCountNewOrcidUsersInXDays(7);
    const newOrcidUsersToday = await getCountNewOrcidUsersInXDays(1);

    logger.trace({ fn: 'getAnalytics' }, 'Fetching new nodes');
    const newNodesInLast30Days = await getCountNewNodesInXDays(30);
    const newNodesInLast7Days = await getCountNewNodesInXDays(7);
    const newNodesToday = await getCountNewNodesInXDays(1);

    logger.trace({ fn: 'getAnalytics' }, 'Fetching active users');
    const activeUsersToday = await getCountActiveUsersInXDays(1);
    const activeUsersInLast7Days = await getCountActiveUsersInXDays(7);
    const activeUsersInLast30Days = await getCountActiveUsersInXDays(30);

    const activeOrcidUsersToday = await getCountActiveOrcidUsersInXDays(1);
    const activeOrcidUsersInLast7Days = await getCountActiveOrcidUsersInXDays(7);
    const activeOrcidUsersInLast30Days = await getCountActiveOrcidUsersInXDays(30);

    logger.trace({ fn: 'getAnalytics' }, 'Fetching views');
    const nodeViewsToday = await getNodeViewsInXDays(1);
    const nodeViewsInLast7Days = await getNodeViewsInXDays(7);
    const nodeViewsInLast30Days = await getNodeViewsInXDays(30);

    logger.trace({ fn: 'getAnalytics' }, 'Fetching bytes');
    const bytesToday = await getBytesInXDays(1);
    const bytesInLast7Days = await getBytesInXDays(7);
    const bytesInLast30Days = await getBytesInXDays(30);

    const analytics = {
      newUsersInLast30Days,
      newUsersInLast7Days,
      newUsersToday,
      newNodesInLast30Days,
      newNodesInLast7Days,
      newNodesToday,

      activeUsersToday,
      activeUsersInLast7Days,
      activeUsersInLast30Days,

      nodeViewsToday,
      nodeViewsInLast7Days,
      nodeViewsInLast30Days,

      bytesToday,
      bytesInLast7Days,
      bytesInLast30Days,

      newOrcidUsersToday,
      newOrcidUsersInLast7Days,
      newOrcidUsersInLast30Days,

      activeOrcidUsersToday,
      activeOrcidUsersInLast7Days,
      activeOrcidUsersInLast30Days,

      allUsers,
      allOrcidUsers,
      allExternalUsers,
    };

    logger.info({ fn: 'getAnalytics', analytics }, 'getAnalytics returning');

    return res.status(200).send(analytics);
  } catch (error) {
    logger.error({ fn: 'getAnalytics', error }, 'Failed to GET getAnalytics');
    return res.status(500).send();
  }
};

export const analyticsChartSchema = zod.object({
  query: zod.object({
    from: zod.string(),
    to: zod.string(),
  }),
});

export const getAnalyticsChartData = async (req: RequestWithUser, res: Response) => {
  const user = req.user;
  logger.info(
    { fn: 'getAnalyticsChartData', query: req.query },
    `GET getAnalyticsChartData called by ${user.email} at ${new Date().toLocaleTimeString()}`,
  );
  const {
    query: { from, to },
  } = req as zod.infer<typeof analyticsChartSchema>;

  const diffInDays = differenceInDays(new Date(to), new Date(from));
  const startDate = subDays(new Date(from), diffInDays);
  const endDate = to;
  logger.trace({ fn: 'getAnalyticsChartData', diffInDays, from, to, startDate, endDate }, 'Fetching new users');

  // todo: make calls parallel
  logger.trace({ fn: 'getAnalyticsChartData' }, 'Fetching active users');
  const newUsers = await getNewUsersInRange({ from: startDate, to: new Date(to) });
  const newOrcidUsers = await getNewOrcidUsersInRange({ from: startDate, to: new Date(to) });

  const activeUsers = await getActiveUsersInRange({ from: startDate, to: new Date(to) });
  const activeOrcidUsers = await getActiveOrcidUsersInRange({ from: startDate, to: new Date(to) });

  const newNodes = await getNewNodesInRange({ from: startDate, to: new Date(to) });
  const nodeViews = await getNodeViewsInRange({ from: startDate, to: new Date(to) });

  const bytes = await getBytesInRange({ from: startDate, to: new Date(to) });

  const selectedDatesInterval = interval(from, to);
  const daysOfInterval = eachDayOfInterval(interval(startDate, to));
  const aggregatedData = daysOfInterval.map((period) => {
    const newUsersAgg = newUsers.filter((user) => isSameDay(user.createdAt, period));
    const newOrcidUsersAgg = newOrcidUsers.filter((user) => isSameDay(user.createdAt, period));
    const activeUsersAgg = activeUsers.filter((user) => isSameDay(user.user.createdAt, period));
    const activeOrcidUsersAgg = activeOrcidUsers.filter((user) => isSameDay(user.user.createdAt, period));
    const newNodesAgg = newNodes.filter((node) => isSameDay(node.createdAt, period));
    const nodeViewsAgg = nodeViews.filter((node) => isSameDay(node.createdAt, period));
    const bytesAgg = bytes.filter((byte) => isSameDay(byte.createdAt, period));
    return {
      date: period,
      newUsers: newUsersAgg.length,
      newOrcidUsers: newOrcidUsersAgg.length,
      activeUsers: activeUsersAgg.length,
      activeOrcidUsers: activeOrcidUsersAgg.length,
      nodeViews: nodeViewsAgg.length,
      newNodes: newNodesAgg.length,
      bytes: bytesAgg.reduce((total, byte) => total + byte.size, 0),
    };
  });

  const data = {
    // newUsers,
    // newOrcidUsers,
    // activeUsers,
    // activeOrcidUsers,
    // newNodes,
    // nodeViews,
    // bytes,
    analytics: aggregatedData,
    meta: {
      selectedDatesInterval,
      diffInDays,
      startDate,
      endDate,
    },
  };

  logger.info({ fn: 'getAnalyticsChartData' }, 'getAnalyticsChartData returning');

  return new SuccessResponse(data).send(res);
};

export const userAnalyticsSchema = zod.object({
  query: zod.object({
    unit: zod.union([zod.literal('days'), zod.literal('weeks')]),
    value: zod.string(),
  }),
});

export const getNewUserAnalytics = async (req: Request, res: Response) => {
  const query = req.query;
  const { unit, value } = query as { unit: 'days'; value: string };

  const daysAgo = parseInt(value, 10);

  const dateXDaysAgo = new Date(new Date().getTime() - daysAgo * 24 * 60 * 60 * 1000);
  const users = await getNewUsersInXDays(dateXDaysAgo);
  const data = await asyncMap(users, async (user) => {
    if (!user.orcid) return user;
    const { profile, works } = await crossRefClient.profileSummary(user.orcid);
    return { ...user, publications: works?.group?.length, dateJoined: profile?.history?.['submission-date'].value };
  });

  new SuccessResponse(data).send(res);
};

export const getNewOrcidUserAnalytics = async (req: Request, res: Response) => {
  // const userAnalyticsSchema = zod.object({ unit: zod.string(), value: zod.string() })
  const query = req.query;
  const { unit, value } = query as { unit: 'days'; value: string };

  const daysAgo = parseInt(value, 10);

  const dateXDaysAgo = new Date(new Date().getTime() - daysAgo * 24 * 60 * 60 * 1000);
  const users = await getNewOrcidUsersInXDays(dateXDaysAgo);
  const data = await asyncMap(users, async (user) => {
    if (!user.orcid) return user;
    const { profile, works } = await crossRefClient.profileSummary(user.orcid);
    return { ...user, publications: works?.group?.length, dateJoined: profile?.history?.['submission-date'].value };
  });

  new SuccessResponse(data).send(res);
};

export const getActiveUserAnalytics = async (req: Request, res: Response) => {
  const { unit, value } = req.query as { unit: 'days'; value: string };

  const daysAgo = parseInt(value, 10);
  const dateXDaysAgo = new Date(new Date().getTime() - daysAgo * 24 * 60 * 60 * 1000);

  const rows = await getActiveUsersInXDays(dateXDaysAgo);
  logger.trace({ rows }, 'getActiveUserAnalytics');
  const data = await asyncMap(rows, async (log) => {
    if (!log.user.orcid) return log.user;
    const { profile, works } = await crossRefClient.profileSummary(log.user.orcid);
    return { ...log.user, publications: works?.group?.length, dateJoined: profile?.history?.['submission-date'].value };
  });
  new SuccessResponse(data).send(res);
};

export const getActiveOrcidUserAnalytics = async (req: Request, res: Response) => {
  const { unit, value } = req.query as { unit: 'days'; value: string };

  const daysAgo = parseInt(value, 10);
  const dateXDaysAgo = new Date(new Date().getTime() - daysAgo * 24 * 60 * 60 * 1000);

  const rows = await getActiveOrcidUsersInXDays(dateXDaysAgo);
  const data = await asyncMap(rows, async (log) => {
    if (!log.user.orcid) return log.user;
    const { profile, works } = await crossRefClient.profileSummary(log.user.orcid);
    return { ...log.user, publications: works?.group?.length, dateJoined: profile?.history?.['submission-date'].value };
  });

  new SuccessResponse(data).send(res);
};
