import { User, UserNotifications } from '@prisma/client';
import { Request, Response } from 'express';
import { z } from 'zod';

import { logger as parentLogger } from '../../logger.js';
import { createUserNotification } from '../../services/NotificationService.js';

import { CreateNotificationSchema } from './schema.js';

interface AuthenticatedRequest extends Request {
  user: User;
}

export interface ErrorResponse {
  error: string;
  details?: z.ZodIssue[] | string;
}

export const createNotification = async (
  req: AuthenticatedRequest & { body: z.infer<typeof CreateNotificationSchema> },
  res: Response<UserNotifications | ErrorResponse>,
) => {
  const logger = parentLogger.child({
    module: 'UserNotifications::CreateNotification',
    userId: req.user?.id,
  });

  logger.info('Creating user notification');
  //
  try {
    if (!req.user) {
      logger.warn('Unauthorized, check middleware');
      return res.status(401).json({ error: 'Unauthorized' } as ErrorResponse);
    }

    const { id: userId } = req.user;
    const notificationData = CreateNotificationSchema.parse({ ...req.body, userId });

    const notification = await createUserNotification(notificationData, { throwOnDisabled: true });

    logger.info({ notificationId: notification.id }, 'Successfully created user notification');
    return res.status(201).json(notification);
  } catch (error) {
    // debugger;
    if (error instanceof z.ZodError) {
      logger.warn({ error: error.errors }, 'Invalid request parameters');
      return res.status(400).json({ error: 'Invalid request parameters', details: error.errors } as ErrorResponse);
    }
    if (error instanceof Error) {
      if (error.message === 'Node not found') {
        logger.warn({ error }, 'Node not found');
        return res.status(404).json({ error: 'Node not found' } as ErrorResponse);
      }
      if (error.message === 'Node does not belong to the user') {
        logger.warn({ error }, 'Node does not belong to the user');
        return res.status(403).json({ error: 'Node does not belong to the user' } as ErrorResponse);
      }
      if (error.message === 'Notification type is disabled for this user') {
        logger.warn({ error }, 'Notification type is disabled for this user');
        return res.status(403).json({ error: 'Notification type is disabled for this user' } as ErrorResponse);
      }
    }
    logger.error({ error }, 'Error creating user notification');
    return res.status(500).json({ error: 'Internal server error' } as ErrorResponse);
  }
};
