import { User, UserNotifications } from '@prisma/client';
import { Request, Response } from 'express';
import { z } from 'zod';

import { AuthenticatedRequest } from '../../core/types.js';
import { logger as parentLogger } from '../../logger.js';
import { updateUserNotification, batchUpdateUserNotifications } from '../../services/NotificationService.js';

const UpdateDataSchema = z.object({
  dismissed: z.boolean().optional(),
});

const BatchUpdateSchema = z.object({
  all: z.boolean().optional(),
  notificationIds: z.array(z.number()),
  updateData: UpdateDataSchema,
});

export interface ErrorResponse {
  error: string;
  details?: z.ZodIssue[] | string;
}

type UpdateNotificationRequest = AuthenticatedRequest & {
  params: { notificationId?: string };
  body: z.infer<typeof UpdateDataSchema> | z.infer<typeof BatchUpdateSchema>;
};

export const updateNotification = async (
  req: UpdateNotificationRequest,
  res: Response<UserNotifications | { count: number } | ErrorResponse>,
) => {
  const logger = parentLogger.child({
    module: 'UserNotifications::UpdateNotification',
    userId: req.user?.id,
  });

  logger.info({ params: req.params, body: req.body }, 'Updating user notification(s)');

  try {
    if (!req.user) {
      logger.warn('Unauthorized, check middleware');
      return res.status(401).json({ error: 'Unauthorized' } as ErrorResponse);
    }

    const { id: userId } = req.user;

    if (req.params.notificationId) {
      // Single update
      const notificationId = parseInt(req.params.notificationId);
      const updateData = UpdateDataSchema.parse(req.body);
      const updatedNotification = await updateUserNotification(notificationId, userId, updateData);
      logger.info({ notificationId: updatedNotification.id }, 'Successfully updated user notification');
      return res.status(200).json(updatedNotification);
    } else {
      // Batch update
      const { notificationIds, updateData, all } = BatchUpdateSchema.parse(req.body);
      const count = await batchUpdateUserNotifications({ notificationIds, userId, updateData, all });
      logger.info({ count }, 'Successfully batch updated user notifications');
      return res.status(200).json({ count });
    }
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
    logger.error({ error }, 'Error updating user notification(s)');
    return res.status(500).json({ error: 'Internal server error' } as ErrorResponse);
  }
};
