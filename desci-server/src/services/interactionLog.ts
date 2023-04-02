import { ActionType, User } from '@prisma/client';
import { Request } from 'express';

import prisma from 'client';

export const saveInteraction = async (req: Request, action: ActionType, data: any, userId?: number) => {
  console.log('interactionLog::saveInteraction');
  return await prisma.interactionLog.create({
    data: { userId, ip: req.ip, userAgent: req.headers['user-agent'], rep: 0, action, extra: JSON.stringify(data) },
  });
};

export const getCountActiveUsersInXDays = async (daysAgo: number): Promise<number> => {
  console.log('interactionLog::getCountActiveUsersInXDays');
  const dateXDaysAgo = new Date(new Date().getTime() - daysAgo * 24 * 60 * 60 * 1000);
  return (
    await prisma.interactionLog.findMany({
      distinct: ['userId'],
      where: {
        createdAt: {
          gte: dateXDaysAgo,
        },
      },
    })
  ).length;
};

export const getNodeViewsInXDays = async (daysAgo: number): Promise<number> => {
  console.log('interactionLog::getNodeViewsInXDays');
  const dateXDaysAgo = new Date(new Date().getTime() - daysAgo * 24 * 60 * 60 * 1000);
  const res =
    await prisma.$queryRaw`select count(1) as count from "InteractionLog" z where action = 'USER_ACTION' and extra::jsonb->'action' = '"viewedNode"'::jsonb and "createdAt" >= ${dateXDaysAgo}`;
  const count = (res as any[])[0].count.toString();
  return parseInt(count);
};
