import { NotificationCategory, UserNotifications } from '@prisma/client';
import { Response } from 'express';
import { z } from 'zod';

import { AuthenticatedRequest } from '../../core/types.js';
import { logger as parentLogger } from '../../logger.js';
import { NotificationService } from '../../services/Notifications/NotificationService.js';

export const GetNotificationsQuerySchema = z.object({
  page: z.string().regex(/^\d+$/).transform(Number).optional().default('1'),
  perPage: z.string().regex(/^\d+$/).transform(Number).optional().default('25'),
  dismissed: z
    .enum(['true', 'false'])
    .optional()
    .transform((value) => (value === 'true' ? true : value === 'false' ? false : undefined)),
  category: z.nativeEnum(NotificationCategory).optional(),
});

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

export const listUserNotifications = async (
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
      return res.status(401).json({ error: 'Unauthorized' } as ErrorResponse);
    }

    const { id: userId } = req.user;
    const query = GetNotificationsQuerySchema.parse(req.query);

    const notifs = await NotificationService.getUserNotifications(userId, query);

    logger.info(
      {
        totalItems: notifs.pagination.totalItems,
        page: notifs.pagination.currentPage,
        totalPages: notifs.pagination.totalPages,
      },
      'Successfully fetched user notifications',
    );

    return res.status(200).json(notifs);
  } catch (error) {
    if (error instanceof z.ZodError) {
      logger.warn({ error: error.errors }, 'Invalid request parameters');
      return res.status(400).json({ error: 'Invalid request parameters', details: error.errors } as ErrorResponse);
    }
    logger.error({ error }, 'Error fetching user notifications');
    return res.status(500).json({ error: 'Internal server error' } as ErrorResponse);
  }
};
