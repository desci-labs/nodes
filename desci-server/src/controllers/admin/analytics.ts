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
} from 'date-fns';
import { Request, Response } from 'express';
import _ from 'lodash';
import zod, { z } from 'zod';

import { SuccessResponse } from '../../core/ApiResponse.js';
import { logger as parentLogger } from '../../logger.js';
import { RequestWithUser } from '../../middleware/authorisation.js';
import { delFromCache, getFromCache, ONE_DAY_TTL, setToCache } from '../../redisClient.js';
import { getCountActiveUsersInXDays } from '../../services/admin/interactionLog.js';
import { communityService } from '../../services/Communities.js';
import { crossRefClient } from '../../services/index.js';
import {
  getActiveOrcidUsersInRange,
  getActiveOrcidUsersInXDays,
  getActiveUsersInRange,
  getActiveUsersInXDays,
  getBadgeVerificationsCountInRange,
  getBadgeVerificationsInRange,
  getCountActiveOrcidUsersInMonth,
  getCountActiveOrcidUsersInXDays,
  getCountActiveUsersInMonth,
  getDownloadedBytesInRange,
  getDownloadedBytesInXDays,
  getNodeViewsInMonth,
  getNodeViewsInRange,
  getNodeViewsInXDays,
} from '../../services/interactionLog.js';
import {
  countPublishedNodesInRange,
  getNodeLikesCountInRange,
  getNodeLikesInRange,
  getPublishedNodesInRange,
} from '../../services/node.js';
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
import { getUtcDateXDaysAgo } from '../../utils/clock.js';
import { asyncMap } from '../../utils.js';

import { analyticsChartSchema } from './schema.js';

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
  nodeLikes: number;
  badgeVerifications: number;
  communitySubmissions: number;
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
  nodeLikes: number;
  badgeVerifications: number;
  communitySubmissions: number;
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
      nodeLikes: number;
      badgeVerifications: number;
      communitySubmissions: number;
    }
    const data: DataRow[] = [];
    while (monthsCovered <= 12) {
      const newUsers = await getCountNewUsersInMonth(curMonth, curYear);
      const newOrcidUsers = await getCountNewUsersWithOrcidInMonth(curMonth, curYear);
      const activeUsers = await getCountActiveUsersInMonth(curMonth, curYear);
      const activeOrcidUsers = await getCountActiveOrcidUsersInMonth(curMonth, curYear);
      const newNodes = await getCountNewNodesInMonth(curMonth, curYear);
      const nodeViews = await getNodeViewsInMonth(curMonth, curYear);
      const badgeVerifications = await getBadgeVerificationsCountInRange({
        from: new Date(curYear, curMonth, 1),
        to: new Date(curYear, curMonth + 1, 1),
      });
      const bytesUploaded = await getBytesInMonth(curMonth, curYear);
      const publishedNodes = await countPublishedNodesInRange({
        from: new Date(curYear, curMonth, 1),
        to: new Date(curYear, curMonth + 1, 1),
      });
      const nodeLikes = await getNodeLikesCountInRange({
        from: new Date(curYear, curMonth, 1),
        to: new Date(curYear, curMonth + 1, 1),
      });
      const communitySubmissions = await communityService.getCommunitySubmissionCountInRange({
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
        nodeLikes,
        communitySubmissions,
        badgeVerifications,
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
      'month,year,newUsers,newOrcidUsers,activeUsers,activeOrcidUsers,newNodes,nodeViews,publishedNodes,bytesUploaded,nodeLikes,communitySubmissions,badgeVerifications',
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
            row.nodeLikes,
            row.communitySubmissions,
            row.badgeVerifications,
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

    logger.trace({ fn: 'getAnalytics' }, 'Fetching analytics data in parallel');

    // Execute all database queries in parallel
    const [
      newUsersInLast30Days,
      newUsersInLast7Days,
      newUsersToday,
      allUsers,
      allExternalUsers,
      allOrcidUsers,
      newOrcidUsersInLast30Days,
      newOrcidUsersInLast7Days,
      newOrcidUsersToday,
      newNodesInLast30Days,
      newNodesInLast7Days,
      newNodesToday,
      activeUsersToday,
      activeUsersInLast7Days,
      activeUsersInLast30Days,
      activeOrcidUsersToday,
      activeOrcidUsersInLast7Days,
      activeOrcidUsersInLast30Days,
      nodeViewsToday,
      nodeViewsInLast7Days,
      nodeViewsInLast30Days,
      publishedNodesToday,
      publishedNodesInLast7Days,
      publishedNodesInLast30Days,
      bytesToday,
      bytesInLast7Days,
      bytesInLast30Days,
      downloadedBytesToday,
      downloadedBytesInLast7Days,
      downloadedBytesInLast30Days,
    ] = await Promise.all([
      getCountNewUsersInXDays(30),
      getCountNewUsersInXDays(7),
      getCountNewUsersInXDays(1),
      getCountAllUsers(),
      getCountAllUsers(), // allExternalUsers
      getCountAllOrcidUsers(),
      getCountNewOrcidUsersInXDays(30),
      getCountNewOrcidUsersInXDays(7),
      getCountNewOrcidUsersInXDays(1),
      getCountNewNodesInXDays(30),
      getCountNewNodesInXDays(7),
      getCountNewNodesInXDays(1),
      getCountActiveUsersInXDays(1),
      getCountActiveUsersInXDays(7),
      getCountActiveUsersInXDays(30),
      getCountActiveOrcidUsersInXDays(1),
      getCountActiveOrcidUsersInXDays(7),
      getCountActiveOrcidUsersInXDays(30),
      getNodeViewsInXDays(1),
      getNodeViewsInXDays(7),
      getNodeViewsInXDays(30),
      countPublishedNodesInRange({
        from: startOfDay(new Date()),
        to: endOfDay(new Date()),
      }),
      countPublishedNodesInRange({
        to: endOfDay(new Date()),
        from: startOfDay(subDays(new Date(), 6)),
      }),
      countPublishedNodesInRange({
        to: endOfDay(new Date()),
        from: startOfDay(subDays(new Date(), 29)),
      }),
      getBytesInXDays(1),
      getBytesInXDays(7),
      getBytesInXDays(30),
      getDownloadedBytesInXDays(1),
      getDownloadedBytesInXDays(7),
      getDownloadedBytesInXDays(30),
    ]);

    const nodeLikesToday = await getNodeLikesCountInRange({
      to: endOfDay(new Date()),
      from: startOfDay(new Date()),
    });
    const nodeLikesInLast7Days = await getNodeLikesCountInRange({
      to: endOfDay(new Date()),
      from: startOfDay(subDays(new Date(), 6)),
    });
    const nodeLikesInLast30Days = await getNodeLikesCountInRange({
      to: endOfDay(new Date()),
      from: startOfDay(subDays(new Date(), 29)),
    });

    const badgeVerificationsToday = await getBadgeVerificationsCountInRange({
      to: endOfDay(new Date()),
      from: startOfDay(new Date()),
    });
    const badgeVerificationsInLast7Days = await getBadgeVerificationsCountInRange({
      to: endOfDay(new Date()),
      from: startOfDay(subDays(new Date(), 6)),
    });
    const badgeVerificationsInLast30Days = await getBadgeVerificationsCountInRange({
      to: endOfDay(new Date()),
      from: startOfDay(subDays(new Date(), 29)),
    });

    const communitySubmissionsToday = await communityService.getCommunitySubmissionCountInRange({
      to: endOfDay(new Date()),
      from: startOfDay(new Date()),
    });
    const communitySubmissionsInLast7Days = await communityService.getCommunitySubmissionCountInRange({
      to: endOfDay(new Date()),
      from: startOfDay(subDays(new Date(), 6)),
    });
    const communitySubmissionsInLast30Days = await communityService.getCommunitySubmissionCountInRange({
      to: endOfDay(new Date()),
      from: startOfDay(subDays(new Date(), 29)),
    });

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

      nodeLikesToday,
      nodeLikesInLast7Days,
      nodeLikesInLast30Days,

      communitySubmissionsToday,
      communitySubmissionsInLast7Days,
      communitySubmissionsInLast30Days,

      badgeVerificationsToday,
      badgeVerificationsInLast7Days,
      badgeVerificationsInLast30Days,
    };

    logger.trace({ analytics }, 'getAnalytics returning');

    return res.status(200).json(analytics);
  } catch (error) {
    console.error('Error:', error);
    logger.error({ fn: 'getAnalytics', error }, 'Failed to GET getAnalytics');
    return res.status(500).send(error);
  }
};

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
    nodeLikes,
    badgeVerifications,
    communitySubmissions,
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
    getNodeLikesInRange({ from, to }),
    getBadgeVerificationsInRange({ from, to }),
    communityService.getCommunitySubmissionInRange({ from, to }),
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
    nodeLikes,
    badgeVerifications,
    communitySubmissions,
  };
}

export const getAggregatedAnalytics = async (req: RequestWithUser, res: Response) => {
  const {
    query: { from, to, interval: timeInterval },
  } = req as zod.infer<typeof analyticsChartSchema>;

  const toDate = new Date(to.split('GMT')[0]);
  const fromDate = new Date(from.split('GMT')[0]);

  const diffInDays = differenceInDays(toDate, fromDate);
  const startDate = startOfDay(fromDate);
  const endDate = endOfDay(toDate);
  logger.trace(
    { fn: 'getAggregatedAnalytics', diffInDays, from, to, fromDate, toDate, startDate, endDate },
    'getAggregatedAnalytics',
  );

  const selectedDates = { from: startDate, to: endDate };

  const cacheKey = `aggregateAnalytics-${selectedDates.from.toDateString()}-${selectedDates.to.toDateString()}-${timeInterval}`;
  logger.trace({ cacheKey }, 'GET: CACHE KEY');

  let aggregatedData = await getFromCache<AnalyticsData[]>(cacheKey);

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
      nodeLikes,
      communitySubmissions,
      badgeVerifications,
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
      const activeUsersAgg = activeUsers.filter((user) => isWithinInterval(user.createdAt, selectedDatesInterval));
      const activeOrcidUsersAgg = activeOrcidUsers.filter((user) =>
        isWithinInterval(user.createdAt, selectedDatesInterval),
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
      const nodeLikesAgg = nodeLikes.filter((node) => isWithinInterval(node.createdAt, selectedDatesInterval));
      const communitySubmissionsAgg = communitySubmissions.filter((submission) =>
        isWithinInterval(submission.createdAt, selectedDatesInterval),
      );

      const badgeVerificationsAgg = badgeVerifications.filter((log) =>
        isWithinInterval(log.createdAt, selectedDatesInterval),
      );

      const peggedPeriod = isWithinInterval(period, interval(selectedDates.from, selectedDates.to))
        ? period
        : selectedDates.from;

      logger.trace(
        {
          selectedDatesInterval,
          period,
          peggedPeriod,
          activeOrcidUsersAgg,
          activeOrcidUsers,
          activeUsersAgg,
          activeUsers,
        },
        'getAggregatedAnalytics#aggregatedData',
      );

      return {
        date: peggedPeriod.toISOString(),
        newUsers: newUsersAgg.length,
        newOrcidUsers: newOrcidUsersAgg.length,
        activeUsers: activeUsersAgg.length,
        activeOrcidUsers: activeOrcidUsersAgg.length,
        nodeViews: nodeViewsAgg.length,
        newNodes: newNodesAgg.length,
        publishedNodes: publishedNodesAgg.length,
        bytes: bytesAgg.reduce((total, byte) => total + byte.size, 0),
        downloadedBytes: downloadedBytesAgg.reduce((total, byte) => total + byte.size, 0),
        nodeLikes: nodeLikesAgg.length,
        communitySubmissions: communitySubmissionsAgg.length,
        badgeVerifications: badgeVerificationsAgg.length,
      };
    });

    // cache query result for a day.
    logger.trace({ cacheKey }, 'SET: CACHE KEY');
    await setToCache(cacheKey, aggregatedData, ONE_DAY_TTL);
  }

  const data = {
    analytics: aggregatedData,
    meta: {
      from: selectedDates.from.toISOString(),
      to: selectedDates.to.toISOString(),
      diffInDays,
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

  const selectedDates = { from: startOfDay(from), to: endOfDay(new Date(to)) };

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
    const endDate = endOfDay(new Date(to));
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
      nodeLikes,
      communitySubmissions,
      badgeVerifications,
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
      const activeUsersAgg = activeUsers.filter((user) => isWithinInterval(user.createdAt, selectedDatesInterval));
      const activeOrcidUsersAgg = activeOrcidUsers.filter((user) =>
        isWithinInterval(user.createdAt, selectedDatesInterval),
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
      const nodeLikesAgg = nodeLikes.filter((like) => isWithinInterval(like.createdAt, selectedDatesInterval));
      const communitySubmissionsAgg = communitySubmissions.filter((submission) =>
        isWithinInterval(submission.createdAt, selectedDatesInterval),
      );
      const badgeVerificationsAgg = badgeVerifications.filter((log) =>
        isWithinInterval(log.createdAt, selectedDatesInterval),
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
        nodeLikes: nodeLikesAgg.length,
        communitySubmissions: communitySubmissionsAgg.length,
        badgeVerifications: badgeVerificationsAgg.length,
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
    'date,newUsers,newOrcidUsers,activeUsers,activeOrcidUsers,newNodes,nodeViews,publishedNodes,bytesUploaded,bytesDownloaded,nodeLikes,communitySubmissions,badgeVerifications',
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
          row.nodeLikes,
          row.communitySubmissions,
          row.badgeVerifications,
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

/**
 * Common function to process user analytics data and handle CSV export
 * @param users - Array of users or user logs to process
 * @param exportCsv - Whether to export as CSV
 * @param res - Express response object
 * @param isActiveUserLog - Whether the users are from active user logs (which have a nested user object)
 * @param fetchOrcidData - Whether to fetch ORCID profile data (publications and dateJoined)
 */
async function processUserAnalytics(
  users: any[],
  exportCsv: boolean,
  res: Response,
  isActiveUserLog: boolean = false,
  fetchOrcidData: boolean = true,
) {
  const data = await asyncMap(users, async (item) => {
    const user = isActiveUserLog ? item.user : item;
    if (!user.orcid || !fetchOrcidData) return { ...user, dateJoined: user.createdAt };
    const { profile, works } = await crossRefClient.profileSummary(user.orcid);
    return { ...user, publications: works?.group?.length, dateJoined: user.createdAt };
  });

  if (exportCsv) {
    const rows: UserDataRow[] = data.map((data) => ({
      email: data.email,
      orcid: data.orcid,
      dateJoined: data.dateJoined || '',
      publications: data.publications || 0,
    }));
    const csv = [
      'id,email,orcid,publications,dateJoined',
      ...rows.map((row, idx) => {
        // Safely format the date if it exists and is valid
        let formattedDate = '';
        if (row.dateJoined) {
          try {
            const date = new Date(row.dateJoined);
            if (!isNaN(date.getTime())) {
              formattedDate = formatDate(date, 'dd MMM yyyy');
            }
          } catch (error) {
            logger.warn({ error, dateJoined: row.dateJoined }, 'Invalid date format in user analytics');
          }
        }

        return [idx, row.email, row.orcid ?? '', row.publications, formattedDate].join(',');
      }),
    ].join('\n');
    res.setHeader('Content-disposition', 'attachment; filename=analytics.csv');
    res.set('Content-Type', 'text/csv');
    res.status(200).send(csv);
  } else {
    new SuccessResponse(data).send(res);
  }
}

export const getNewUserAnalytics = async (req: Request, res: Response) => {
  const query = req.query;
  const { unit, value, exportCsv } = query as z.infer<typeof userAnalyticsSchema>['query'];

  const daysAgo = parseInt(value, 10);
  const utcMidnightXDaysAgo = getUtcDateXDaysAgo(daysAgo);

  const users = await getNewUsersInXDays(utcMidnightXDaysAgo);
  await processUserAnalytics(users, exportCsv, res);
};

export const getNewOrcidUserAnalytics = async (req: Request, res: Response) => {
  // const userAnalyticsSchema = zod.object({ unit: zod.string(), value: zod.string() })
  const query = req.query;
  const { unit, value } = query as z.infer<typeof userAnalyticsSchema>['query'];

  const daysAgo = parseInt(value, 10);

  const utcMidnightXDaysAgo = getUtcDateXDaysAgo(daysAgo);
  const users = await getNewOrcidUsersInXDays(utcMidnightXDaysAgo);
  await processUserAnalytics(users, false, res, false, false);
};

export const getActiveUserAnalytics = async (req: Request, res: Response) => {
  const { unit, value, exportCsv } = req.query as z.infer<typeof userAnalyticsSchema>['query'];

  const daysAgo = parseInt(value, 10);
  const utcMidnightXDaysAgo = getUtcDateXDaysAgo(daysAgo);

  const rows = await getActiveUsersInXDays(utcMidnightXDaysAgo);
  await processUserAnalytics(rows, exportCsv, res, true);
};

export const getActiveOrcidUserAnalytics = async (req: Request, res: Response) => {
  const { unit, value } = req.query as { unit: 'days'; value: string };

  const daysAgo = parseInt(value, 10);
  const utcMidnightXDaysAgo = getUtcDateXDaysAgo(daysAgo);

  const rows = await getActiveOrcidUsersInXDays(utcMidnightXDaysAgo);
  await processUserAnalytics(rows, false, res, true, false);
};
