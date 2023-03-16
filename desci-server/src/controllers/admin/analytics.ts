import { User } from '@prisma/client';
import { Request, Response } from 'express';

import { getCountActiveUsersInXDays } from 'services/interactionLog';
import { getCountNewNodesInXDays } from 'services/nodeManager';
import { getCountNewUsersInXDays } from 'services/user';

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
    };

    console.log('getAnalytics returning', analytics);

    return res.status(200).send(analytics);
  } catch (error) {
    console.error('Failed to GET getAnalytics', error);
    return res.status(500).send();
  }
};
