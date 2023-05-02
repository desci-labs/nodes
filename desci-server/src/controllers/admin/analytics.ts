import { User } from '@prisma/client';
import { Request, Response } from 'express';

import {
  getCountActiveUsersInMonth,
  getCountActiveUsersInXDays,
  getNodeViewsInMonth,
  getNodeViewsInXDays,
} from 'services/interactionLog';
import {
  getCountNewNodesInXDays,
  getBytesInXDays,
  getCountNewNodesInMonth,
  getBytesInMonth,
} from 'services/nodeManager';
import { getCountNewUsersInMonth, getCountNewUsersInXDays } from 'services/user';

// create a csv with the following fields for each month
// - new users, new nodes, active users, node views, bytes uploaded
export const createCsv = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user as User;
    console.log('GET createCsv called by', user.email);

    // start month is 12 months ago
    const endYear = new Date().getFullYear();
    const endMonth = new Date().getMonth();
    let curYear = endYear - 1;
    let curMonth = endMonth;
    interface DataRow {
      month: string;
      year: string;
      newUsers: number;
      newNodes: number;
      activeUsers: number;
      nodeViews: number;
      bytesUploaded: number;
    }
    const data: DataRow[] = [];
    while (curYear < endYear || curMonth <= endMonth) {
      const newUsers = await getCountNewUsersInMonth(curMonth, curYear);
      const newNodes = await getCountNewNodesInMonth(curMonth, curYear);
      const activeUsers = await getCountActiveUsersInMonth(curMonth, curYear);
      const nodeViews = await getNodeViewsInMonth(curMonth, curYear);
      const bytesUploaded = await getBytesInMonth(curMonth, curYear);

      data.push({
        month: (curMonth + 1).toString(),
        year: curYear.toString(),
        newUsers,
        newNodes,
        activeUsers,
        nodeViews,
        bytesUploaded,
      });
      curMonth++;
      if (curMonth > 11) {
        curYear++;
        curMonth = 0;
      }
    }
    // export data to csv

    const csv = [
      'month,year,newUsers,newNodes,activeUsers,nodeViews,bytesUploaded',
      ...data
        .reverse()
        .map((row) =>
          [row.month, row.year, row.newUsers, row.newNodes, row.activeUsers, row.nodeViews, row.bytesUploaded].join(
            ',',
          ),
        ),
    ].join('\n');
    res.setHeader('Content-disposition', 'attachment; filename=analytics.csv');
    res.set('Content-Type', 'text/csv');
    res.status(200).send(csv);
  } catch (error) {
    console.error('Failed to GET createCsv', error);
    res.sendStatus(500);
  }
};

export const getAnalytics = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user as User;
    console.log('GET getAnalytics called by', user.email);

    console.log('Fetching new users');
    const newUsersInLast30Days = await getCountNewUsersInXDays(30);
    const newUsersInLast7Days = await getCountNewUsersInXDays(7);
    const newUsersToday = await getCountNewUsersInXDays(1);

    console.log('Fetching new nodes');
    const newNodesInLast30Days = await getCountNewNodesInXDays(30);
    const newNodesInLast7Days = await getCountNewNodesInXDays(7);
    const newNodesToday = await getCountNewNodesInXDays(1);

    console.log('Fetching active users');
    const activeUsersToday = await getCountActiveUsersInXDays(1);
    const activeUsersInLast7Days = await getCountActiveUsersInXDays(7);
    const activeUsersInLast30Days = await getCountActiveUsersInXDays(30);

    console.log('Fetching views');
    const nodeViewsToday = await getNodeViewsInXDays(1);
    const nodeViewsInLast7Days = await getNodeViewsInXDays(7);
    const nodeViewsInLast30Days = await getNodeViewsInXDays(30);

    console.log('Fetching bytes');
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
    };

    console.log('getAnalytics returning', analytics);

    return res.status(200).send(analytics);
  } catch (error) {
    console.error('Failed to GET getAnalytics', error);
    return res.status(500).send();
  }
};
