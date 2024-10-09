import { User, UserNotifications } from '@prisma/client';
import { Request, Response } from 'express';
import { z } from 'zod';

import { logger as parentLogger } from '../../logger.js';
import { updateUserNotification } from '../../services/NotificationService.js';

export const UpdateNotificationSchema = z.object({
  notificationId: z.number(),
  dismissed: z.boolean(),
});

interface AuthenticatedRequest extends Request {
  user: User;
}

export interface ErrorResponse {
  error: string;
  details?: z.ZodIssue[] | string;
}

export const updateNotification = async (
  req: AuthenticatedRequest & { body: z.infer<typeof UpdateNotificationSchema> },
  res: Response<UserNotifications | ErrorResponse>,
) => {
  const logger = parentLogger.child({
    module: 'UserNotifications::UpdateNotification',
    userId: req.user?.id,
  });

  logger.info({ body: req.body }, 'Updating user notification');

  try {
    if (!req.user) {
      logger.warn('Unauthorized, check middleware');
      return res.status(401).json({ error: 'Unauthorized' } as ErrorResponse);
    }

    const { id: userId } = req.user;
    const { notificationId, dismissed } = UpdateNotificationSchema.parse(req.body);

    const updatedNotification = await updateUserNotification(notificationId, userId, dismissed);

    logger.info({ notificationId: updatedNotification.id }, 'Successfully updated user notification');
    return res.status(200).json(updatedNotification);
  } catch (error) {
    if (error instanceof z.ZodError) {
      logger.warn({ error: error.errors }, 'Invalid request parameters');
      return res.status(400).json({ error: 'Invalid request parameters', details: error.errors } as ErrorResponse);
    }
    if (error instanceof Error) {
      if (error.message === 'Notification not found') {
        logger.warn({ error }, 'Notification not found');
        return res.status(404).json({ error: 'Notification not found' } as ErrorResponse);
      }
      if (error.message === 'Notification does not belong to the user') {
        logger.warn({ error }, 'Notification does not belong to the user');
        return res.status(403).json({ error: 'Notification does not belong to the user' } as ErrorResponse);
      }
    }
    logger.error({ error }, 'Error updating user notification');
    return res.status(500).json({ error: 'Internal server error' } as ErrorResponse);
  }
};
