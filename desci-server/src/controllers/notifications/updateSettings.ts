import { User, NotificationType } from '@prisma/client';
import { Request, Response } from 'express';
import { z } from 'zod';

import { logger as parentLogger } from '../../logger.js';
import { updateNotificationSettings } from '../../services/NotificationService.js';

const NotificationSettingsSchema = z.record(z.nativeEnum(NotificationType), z.boolean());

interface AuthenticatedRequest extends Request {
  user: User;
}

export interface ErrorResponse {
  error: string;
  details?: z.ZodIssue[] | string;
}

export const updateSettings = async (
  req: AuthenticatedRequest & { body: z.infer<typeof NotificationSettingsSchema> },
  res: Response<Partial<Record<NotificationType, boolean>> | ErrorResponse>,
) => {
  const logger = parentLogger.child({
    module: 'UserNotifications::UpdateSettings',
    userId: req.user?.id,
  });

  try {
    if (!req.user) {
      logger.warn('Unauthorized, check middleware');
      return res.status(401).json({ error: 'Unauthorized' } as ErrorResponse);
    }

    const { id: userId } = req.user;
    const settings = NotificationSettingsSchema.parse(req.body);

    const newSettings = await updateNotificationSettings(userId, settings);

    return res.status(200).json(newSettings);
  } catch (error) {
    if (error instanceof z.ZodError) {
      logger.warn({ error: error.errors }, 'Invalid request parameters');
      return res.status(400).json({ error: 'Invalid request parameters', details: error.errors } as ErrorResponse);
    }
    logger.error({ error }, 'Error updating user notification settings');
    return res.status(500).json({ error: 'Internal server error' } as ErrorResponse);
  }
};
