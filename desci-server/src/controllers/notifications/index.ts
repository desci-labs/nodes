import { User, UserNotifications } from '@prisma/client';
import { Request, Response } from 'express';
import { z } from 'zod';

import { prisma } from '../../client.js';
import { logger as parentLogger } from '../../logger.js';

const GetNotificationsQuerySchema = z.object({
  page: z.string().regex(/^\d+$/).transform(Number).optional().default('1'),
  perPage: z.string().regex(/^\d+$/).transform(Number).optional().default('25'),
  dismissed: z
    .enum(['true', 'false'])
    .optional()
    .transform((value) => value === 'true'),
});

interface AuthenticatedRequest extends Request {
  user: User;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    currentPage: number;
    totalPages: number;
    totalItems: number;
  };
}

export interface ErrorResponse {
  error: string;
  details?: z.ZodIssue[] | string;
}

export const getUserNotifications = async (
  req: AuthenticatedRequest & { query: z.infer<typeof GetNotificationsQuerySchema> },
  res: Response<PaginatedResponse<UserNotifications> | ErrorResponse>,
) => {
  const logger = parentLogger.child({
    module: 'UserNotifications::GetUserNotifications',
    userId: req.user?.id,
    query: req.query,
  });

  logger.info('Fetching user notifications');

  try {
    if (!req.user) {
      logger.warn('Unauthorized, check middleware');
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { id: userId } = req.user;
    const { page, perPage, dismissed = false } = GetNotificationsQuerySchema.parse(req.query);

    const skip = (page - 1) * perPage;

    const whereClause = {
      userId,
      dismissed,
    };

    const [notifications, totalItems] = await Promise.all([
      prisma.userNotifications.findMany({
        where: whereClause,
        skip,
        take: perPage,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.userNotifications.count({ where: whereClause }),
    ]);

    const totalPages = Math.ceil(totalItems / perPage);

    const response: PaginatedResponse<UserNotifications> = {
      data: notifications,
      pagination: {
        currentPage: page,
        totalPages,
        totalItems,
      },
    };

    logger.info({ totalItems, page, totalPages }, 'Successfully fetched user notifications');
    return res.status(200).json(response);
  } catch (error) {
    if (error instanceof z.ZodError) {
      logger.warn({ error: error.errors }, 'Invalid request parameters');
      return res.status(400).json({ error: 'Invalid request parameters', details: error.errors });
    }
    logger.error({ error }, 'Error fetching user notifications');
    return res.status(500).json({ error: 'Internal server error' });
  }
};
