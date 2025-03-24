import { User } from '@prisma/client';
import {
  differenceInDays,
  subDays,
  interval,
  eachDayOfInterval,
  eachWeekOfInterval,
  eachMonthOfInterval,
  eachYearOfInterval,
  formatDate,
  isWithinInterval,
  startOfDay,
  endOfDay,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  startOfYear,
  endOfYear,
  sub,
  formatDistanceToNow,
} from 'date-fn-latest';
import { Request, Response } from 'express';
import _ from 'lodash';
import zod, { z } from 'zod';

import { SuccessResponse } from '../../core/ApiResponse.js';
import { logger as parentLogger } from '../../logger.js';
import { RequestWithUser } from '../../middleware/authorisation.js';
import { getFromCache, ONE_DAY_TTL, redisClient, setToCache } from '../../redisClient.js';
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
  getDownloadedBytesInRange,
  getDownloadedBytesInXDays,
  getNodeViewsInMonth,
  getNodeViewsInRange,
  getNodeViewsInXDays,
} from '../../services/interactionLog.js';
import { countPublishedNodesInRange, getPublishedNodesInRange } from '../../services/node.js';
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

interface DataRow {
  date: string;
  newUsers: number;
  newOrcidUsers: number;
  activeUsers: number;
  activeOrcidUsers: number;
  newNodes: number;
  nodeViews: number;
  bytesUploaded: string;
  bytesDownloaded: string;
  publishedNodes: number;
}
interface AnalyticsData {
  date: Date | string;
  newUsers: number;
  newOrcidUsers: number;
  activeUsers: number;
  activeOrcidUsers: number;
  newNodes: number;
  nodeViews: number;
  bytes: number;
  publishedNodes: number;
  downloadedBytes: number;
}

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
      publishedNodes: number;
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
      const publishedNodes = await countPublishedNodesInRange({
        from: new Date(curYear, curMonth, 1),
        to: new Date(curYear, curMonth + 1, 1),
      });

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
        publishedNodes,
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
      'month,year,newUsers,newOrcidUsers,activeUsers,activeOrcidUsers,newNodes,nodeViews,publishedNodes,bytesUploaded',
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
            row.publishedNodes,
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

    const nodeViewsToday = await getNodeViewsInXDays(1);
    const nodeViewsInLast7Days = await getNodeViewsInXDays(7);
    const nodeViewsInLast30Days = await getNodeViewsInXDays(30);

    const publishedNodesToday = await countPublishedNodesInRange({
      from: startOfDay(new Date()),
      to: endOfDay(new Date()),
    });
    const publishedNodesInLast7Days = await countPublishedNodesInRange({
      to: endOfDay(new Date()),
      from: startOfDay(subDays(new Date(), 7)),
    });
    const publishedNodesInLast30Days = await countPublishedNodesInRange({
      to: endOfDay(new Date()),
      from: startOfDay(subDays(new Date(), 30)),
    });
    logger.trace({ fn: 'getAnalytics' }, 'Fetching views');

    logger.trace({ fn: 'getAnalytics' }, 'Fetching bytes');
    const bytesToday = await getBytesInXDays(1);
    const bytesInLast7Days = await getBytesInXDays(7);
    const bytesInLast30Days = await getBytesInXDays(30);

    const downloadedBytesToday = await getDownloadedBytesInXDays(1);
    const downloadedBytesInLast7Days = await getDownloadedBytesInXDays(7);
    const downloadedBytesInLast30Days = await getDownloadedBytesInXDays(30);

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

      publishedNodesToday,
      publishedNodesInLast7Days,
      publishedNodesInLast30Days,

      downloadedBytesToday,
      downloadedBytesInLast7Days,
      downloadedBytesInLast30Days,
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
    interval: zod
      .union([zod.literal('daily'), zod.literal('weekly'), zod.literal('monthly'), zod.literal('yearly')])
      .optional()
      .default('daily'),
  }),
});

async function aggregateAnalytics(from: Date, to: Date) {
  const start = Date.now();
  const [
    newUsers,
    newOrcidUsers,
    activeUsers,
    activeOrcidUsers,
    newNodes,
    nodeViews,
    bytes,
    publishedNodes,
    downloadedBytes,
  ] = await Promise.all([
    getNewUsersInRange({ from, to }),
    getNewOrcidUsersInRange({ from, to }),
    getActiveUsersInRange({ from, to }),
    getActiveOrcidUsersInRange({ from, to }),
    getNewNodesInRange({ from, to }),
    getNodeViewsInRange({ from, to }),
    getBytesInRange({ from, to }),
    getPublishedNodesInRange({ from, to }),
    getDownloadedBytesInRange({ from, to }),
  ]);
  logger.trace({ duration: formatDistanceToNow(start), delta: Date.now() - start }, 'END: aggregateAnalytics');
  return {
    newUsers,
    newOrcidUsers,
    activeUsers,
    activeOrcidUsers,
    newNodes,
    nodeViews,
    bytes,
    publishedNodes,
    downloadedBytes,
  };
}

export const getAggregatedAnalytics = async (req: RequestWithUser, res: Response) => {
  const user = req.user;
  logger.info(
    { fn: 'getAggregatedAnalytics', query: req.query },
    `GET getAggregatedAnalytics called by ${user.email} at ${new Date().toLocaleTimeString()}`,
  );
  const {
    query: { from, to, interval: timeInterval },
  } = req as zod.infer<typeof analyticsChartSchema>;

  const diffInDays = differenceInDays(new Date(to), new Date(from));
  const startDate = subDays(new Date(from), diffInDays);
  const endDate = to;
  logger.trace({ fn: 'getAggregatedAnalytics', diffInDays, from, to, startDate, endDate }, 'getAggregatedAnalytics');

  const selectedDates = { from: startOfDay(startDate), to: startOfDay(new Date(to)) };
  const selectedDatesInterval = interval(from, to);

  const cacheKey = `aggregateAnalytics-${startOfDay(from).toDateString()}-${endOfDay(selectedDates.to).toDateString()}-${timeInterval}`;
  logger.trace({ cacheKey }, 'GET: CACHE KEY');
  let aggregatedData = null; // await getFromCache<AnalyticsData[]>(cacheKey);

  if (!aggregatedData) {
    const {
      bytes,
      nodeViews,
      newNodes,
      newUsers,
      activeUsers,
      newOrcidUsers,
      activeOrcidUsers,
      publishedNodes,
      downloadedBytes,
    } = await aggregateAnalytics(selectedDates.from, selectedDates.to);

    const getIntervals = () => {
      switch (timeInterval) {
        case 'daily':
          return selectedDates?.from && selectedDates?.to
            ? eachDayOfInterval(interval(selectedDates.from, selectedDates.to))
            : null;
        case 'weekly':
          return selectedDates?.from && selectedDates?.to
            ? eachWeekOfInterval(interval(selectedDates.from, selectedDates.to))
            : null;
        case 'monthly':
          return selectedDates?.from && selectedDates?.to
            ? eachMonthOfInterval(interval(selectedDates.from, selectedDates.to))
            : null;
        case 'yearly':
          return selectedDates?.from && selectedDates?.to
            ? eachYearOfInterval(interval(selectedDates.from, selectedDates.to))
            : null;
        default:
          return selectedDates?.from && selectedDates?.to
            ? eachDayOfInterval(interval(selectedDates.from, selectedDates.to))
            : null;
      }
    };
    const allDatesInInterval = getIntervals();

    aggregatedData = allDatesInInterval.map((period) => {
      const selectedDatesInterval =
        timeInterval === 'daily'
          ? interval(startOfDay(period), endOfDay(period))
          : timeInterval === 'weekly'
            ? interval(startOfWeek(period), endOfWeek(period))
            : timeInterval === 'monthly'
              ? interval(startOfMonth(period), endOfMonth(period))
              : timeInterval === 'yearly'
                ? interval(startOfYear(period), endOfYear(period))
                : interval(startOfDay(period), endOfDay(period));

      const newUsersAgg = newUsers.filter((user) => isWithinInterval(user.createdAt, selectedDatesInterval));
      const newOrcidUsersAgg = newOrcidUsers.filter((user) => isWithinInterval(user.createdAt, selectedDatesInterval));
      const activeUsersAgg = activeUsers.filter((user) => isWithinInterval(user.user.createdAt, selectedDatesInterval));
      const activeOrcidUsersAgg = activeOrcidUsers.filter((user) =>
        isWithinInterval(user.user.createdAt, selectedDatesInterval),
      );
      const newNodesAgg = newNodes.filter((node) => isWithinInterval(node.createdAt, selectedDatesInterval));
      const nodeViewsAgg = nodeViews.filter((node) => isWithinInterval(node.createdAt, selectedDatesInterval));
      const bytesAgg = bytes.filter((byte) => isWithinInterval(byte.createdAt, selectedDatesInterval));
      const downloadedBytesAgg = downloadedBytes.filter((byte) =>
        isWithinInterval(byte.createdAt, selectedDatesInterval),
      );
      const publishedNodesAgg = publishedNodes.filter((node) =>
        isWithinInterval(node.createdAt, selectedDatesInterval),
      );

      return {
        date: period,
        newUsers: newUsersAgg.length,
        newOrcidUsers: newOrcidUsersAgg.length,
        activeUsers: activeUsersAgg.length,
        activeOrcidUsers: activeOrcidUsersAgg.length,
        nodeViews: nodeViewsAgg.length,
        newNodes: newNodesAgg.length,
        publishedNodes: publishedNodesAgg.length,
        bytes: bytesAgg.reduce((total, byte) => total + byte.size, 0),
        downloadedBytes: downloadedBytesAgg.reduce((total, byte) => total + byte.size, 0),
      };
    });

    // cache query result for a day.
    logger.trace({ cacheKey }, 'SET: CACHE KEY');
    await setToCache(cacheKey, aggregatedData, ONE_DAY_TTL);
  }

  const data = {
    analytics: aggregatedData,
    meta: {
      selectedDatesInterval,
      diffInDays,
      startDate,
      endDate,
    },
  };
  return new SuccessResponse(data).send(res);
};

export const getAggregatedAnalyticsCsv = async (req: RequestWithUser, res: Response) => {
  const user = req.user;
  logger.info(
    { fn: 'getAggregatedAnalytics', query: req.query },
    `GET getAggregatedAnalytics called by ${user.email} at ${new Date().toLocaleTimeString()}`,
  );
  const {
    query: { from, to, interval: timeInterval },
  } = req as zod.infer<typeof analyticsChartSchema>;

  const selectedDates = { from: startOfDay(from), to: startOfDay(new Date(to)) };

  const getIntervals = () => {
    switch (timeInterval) {
      // case "hourly":
      //   return selectedDates?.from && selectedDates?.to
      //     ? eachHourOfInterval(interval(selectedDates.from, selectedDates.to))
      //     : null;
      case 'daily':
        return selectedDates?.from && selectedDates?.to
          ? eachDayOfInterval(interval(selectedDates.from, selectedDates.to))
          : null;
      case 'weekly':
        return selectedDates?.from && selectedDates?.to
          ? eachWeekOfInterval(interval(selectedDates.from, selectedDates.to))
          : null;
      case 'monthly':
        return selectedDates?.from && selectedDates?.to
          ? eachMonthOfInterval(interval(selectedDates.from, selectedDates.to))
          : null;
      case 'yearly':
        return selectedDates?.from && selectedDates?.to
          ? eachYearOfInterval(interval(selectedDates.from, selectedDates.to))
          : null;
      default:
        return selectedDates?.from && selectedDates?.to
          ? eachDayOfInterval(interval(selectedDates.from, selectedDates.to))
          : null;
    }
  };
  const allDatesInInterval = getIntervals();

  const byteValueNumberFormatter = Intl.NumberFormat('en', {
    notation: 'compact',
    style: 'unit',
    unit: 'byte',
    unitDisplay: 'narrow',
  });

  let aggregatedData: DataRow[];

  const cacheKey = `aggregateAnalytics-${startOfDay(from).toDateString()}-${endOfDay(selectedDates.to).toDateString()}-${timeInterval}`;
  logger.trace({ cacheKey }, 'GET: CACHE KEY');
  const analyticsData = await getFromCache<AnalyticsData[]>(cacheKey);

  if (!analyticsData) {
    logger.trace('PULL FROM Database');
    const diffInDays = differenceInDays(new Date(to), new Date(from));
    const startDate = new Date(from); // subDays(new Date(from), diffInDays);
    const endDate = to;
    logger.trace({ fn: 'getAggregatedAnalytics', diffInDays, from, to, startDate, endDate }, 'Fetching new users');

    // todo: make calls parallel
    logger.trace({ fn: 'getAggregatedAnalytics' }, 'Fetching active users');

    const {
      bytes,
      nodeViews,
      newNodes,
      newUsers,
      activeUsers,
      newOrcidUsers,
      activeOrcidUsers,
      publishedNodes,
      downloadedBytes,
    } = await aggregateAnalytics(selectedDates.from, selectedDates.to);

    aggregatedData = allDatesInInterval.map((period) => {
      const selectedDatesInterval =
        timeInterval === 'daily'
          ? interval(startOfDay(period), endOfDay(period))
          : timeInterval === 'weekly'
            ? interval(startOfWeek(period), endOfWeek(period))
            : timeInterval === 'monthly'
              ? interval(startOfMonth(period), endOfMonth(period))
              : timeInterval === 'yearly'
                ? interval(startOfYear(period), endOfYear(period))
                : interval(startOfDay(period), endOfDay(period));

      const newUsersAgg = newUsers.filter((user) => isWithinInterval(user.createdAt, selectedDatesInterval));
      const newOrcidUsersAgg = newOrcidUsers.filter((user) => isWithinInterval(user.createdAt, selectedDatesInterval));
      const activeUsersAgg = activeUsers.filter((user) => isWithinInterval(user.user.createdAt, selectedDatesInterval));
      const activeOrcidUsersAgg = activeOrcidUsers.filter((user) =>
        isWithinInterval(user.user.createdAt, selectedDatesInterval),
      );
      const newNodesAgg = newNodes.filter((node) => isWithinInterval(node.createdAt, selectedDatesInterval));
      const nodeViewsAgg = nodeViews.filter((node) => isWithinInterval(node.createdAt, selectedDatesInterval));
      const publishedNodesAgg = publishedNodes.filter((node) =>
        isWithinInterval(node.createdAt, selectedDatesInterval),
      );
      const bytesAgg = bytes.filter((byte) => isWithinInterval(byte.createdAt, selectedDatesInterval));
      const downloadedBytesAgg = downloadedBytes.filter((byte) =>
        isWithinInterval(byte.createdAt, selectedDatesInterval),
      );
      return {
        date:
          timeInterval === 'yearly'
            ? formatDate(period, 'yyyy')
            : timeInterval === 'monthly'
              ? formatDate(period, 'MMM yyyy')
              : formatDate(period, 'dd MMM yyyy'),
        newUsers: newUsersAgg.length,
        newOrcidUsers: newOrcidUsersAgg.length,
        activeUsers: activeUsersAgg.length,
        activeOrcidUsers: activeOrcidUsersAgg.length,
        nodeViews: nodeViewsAgg.length,
        newNodes: newNodesAgg.length,
        publishedNodes: publishedNodesAgg.length,
        bytesUploaded: byteValueNumberFormatter.format(bytesAgg.reduce((total, byte) => total + byte.size, 0)),
        bytesDownloaded: byteValueNumberFormatter.format(
          downloadedBytesAgg.reduce((total, byte) => total + byte.size, 0),
        ),
      };
    });
  } else {
    logger.trace('PULLED FROM CACHE');
    aggregatedData = analyticsData
      .filter((data) => isWithinInterval(data.date, interval(selectedDates.from, selectedDates.to)))
      .map((data) => ({
        ...data,
        date:
          timeInterval === 'yearly'
            ? formatDate(data.date, 'yyyy')
            : timeInterval === 'monthly'
              ? formatDate(data.date, 'MMM yyyy')
              : formatDate(data.date, 'dd MMM yyyy'),
        bytesUploaded: byteValueNumberFormatter.format(data.bytes),
        bytesDownloaded: byteValueNumberFormatter.format(data.downloadedBytes),
      }));
  }

  const csv = [
    'date,newUsers,newOrcidUsers,activeUsers,activeOrcidUsers,newNodes,nodeViews,publishedNodes,bytesUploaded,bytesDownloaded',
    ...aggregatedData
      .reverse()
      .map((row) =>
        [
          row.date,
          row.newUsers,
          row.newOrcidUsers,
          row.activeUsers,
          row.activeOrcidUsers,
          row.newNodes,
          row.nodeViews,
          row.publishedNodes,
          row.bytesUploaded,
          row.bytesDownloaded,
        ].join(','),
      ),
  ].join('\n');
  res.setHeader('Content-disposition', 'attachment; filename=analytics.csv');
  res.set('Content-Type', 'text/csv');

  logger.info({ fn: 'getAggregatedAnalytics' }, 'getAggregatedAnalytics returning');

  res.status(200).send(csv);
};

export const userAnalyticsSchema = zod.object({
  query: zod.object({
    unit: zod.union([zod.literal('days'), zod.literal('weeks')]),
    value: zod.string(),
    exportCsv: zod.coerce.boolean().optional().default(false),
  }),
});

interface UserDataRow {
  // userId: number;
  email: string;
  orcid: string;
  publications: number;
  dateJoined: string | number;
}

export const getNewUserAnalytics = async (req: Request, res: Response) => {
  const query = req.query;
  const { unit, value, exportCsv } = query as z.infer<typeof userAnalyticsSchema>['query'];

  const daysAgo = parseInt(value, 10);

  const dateXDaysAgo = new Date(new Date().getTime() - daysAgo * 24 * 60 * 60 * 1000);
  const users = await getNewUsersInXDays(dateXDaysAgo);
  const data = await asyncMap(users, async (user) => {
    if (!user.orcid) return { ...user, publications: 0, dateJoined: '' };
    const { profile, works } = await crossRefClient.profileSummary(user.orcid);
    return { ...user, publications: works?.group?.length, dateJoined: profile?.history?.['submission-date'].value };
  });

  logger.trace({ exportCsv }, 'getNewUserAnalytics');
  if (exportCsv) {
    const rows: UserDataRow[] = data.map((data) => ({
      email: data.email,
      orcid: data.orcid,
      dateJoined: data.dateJoined,
      publications: data.publications,
    }));
    logger.trace({ rows, data }, 'getNewUserAnalytics');
    const csv = [
      'id,email,orcid,publications,dateJoined',
      ...rows.map((row, idx) =>
        [idx, row.email, row.orcid ?? '', row.publications, formatDate(new Date(row.dateJoined), 'dd MMM yyyy')].join(
          ',',
        ),
      ),
    ].join('\n');
    logger.trace({ csv }, 'getNewUserAnalytics');
    res.setHeader('Content-disposition', 'attachment; filename=analytics.csv');
    res.set('Content-Type', 'text/csv');
    res.status(200).send(csv);
  } else {
    new SuccessResponse(data).send(res);
  }
};

export const getNewOrcidUserAnalytics = async (req: Request, res: Response) => {
  // const userAnalyticsSchema = zod.object({ unit: zod.string(), value: zod.string() })
  const query = req.query;
  const { unit, value } = query as z.infer<typeof userAnalyticsSchema>['query'];

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
  const { unit, value, exportCsv } = req.query as z.infer<typeof userAnalyticsSchema>['query'];

  const daysAgo = parseInt(value, 10);
  const dateXDaysAgo = new Date(new Date().getTime() - daysAgo * 24 * 60 * 60 * 1000);

  const rows = await getActiveUsersInXDays(dateXDaysAgo);

  const data = await asyncMap(rows, async (log) => {
    if (!log.user.orcid) return { ...log.user, publications: 0, dateJoined: '' };
    const { profile, works } = await crossRefClient.profileSummary(log.user.orcid);
    return { ...log.user, publications: works?.group?.length, dateJoined: profile?.history?.['submission-date'].value };
  });

  if (exportCsv) {
    const rows: UserDataRow[] = data.map((data) => ({
      email: data.email,
      orcid: data.orcid,
      dateJoined: data.dateJoined,
      publications: data.publications,
    }));
    const csv = [
      'id,email,orcid,publications,dateJoined',
      ...rows.map((row, idx) =>
        [idx, row.email, row.orcid ?? '', row.publications, formatDate(new Date(row.dateJoined), 'dd MMM yyyy')].join(
          ',',
        ),
      ),
    ].join('\n');
    res.setHeader('Content-disposition', 'attachment; filename=analytics.csv');
    res.set('Content-Type', 'text/csv');
    res.status(200).send(csv);
  } else {
    new SuccessResponse(data).send(res);
  }
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
