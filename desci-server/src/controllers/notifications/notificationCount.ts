import { Response } from 'express';

import { AuthenticatedRequest } from '../../core/types.js';
import { logger as parentLogger } from '../../logger.js';
import { NotificationService } from '../../services/Notifications/NotificationService.js';

export interface ErrorResponse {
  error: string;
}

export const getNotificationCount = async (
  req: AuthenticatedRequest,
  res: Response<{ unseenNotificationCount: number } | ErrorResponse>,
) => {
  const logger = parentLogger.child({
    module: 'UserNotifications::getNotificationCount',
    userId: req.user?.id,
  });

  logger.trace('Getting notification count');
  try {
    if (!req.user) {
      logger.warn('Unauthorized, check middleware');
      return res.status(401).json({ error: 'Unauthorized' } as ErrorResponse);
    }
    const user = req.user;
    const unseenNotificationCount = await NotificationService.getUnseenNotificationCount({ user });

    logger.info({ unseenNotificationCount }, 'Successfully retrieved notification count');
    return res.status(201).json({ unseenNotificationCount });
  } catch (error) {
    logger.error({ error }, 'Error retrieving unseenNotificationCount');
    return res.status(500).json({ error: 'Internal server error' } as ErrorResponse);
  }
};

export const resetNotificationCount = async (
  req: AuthenticatedRequest,
  res: Response<{ message: string } | ErrorResponse>,
) => {
  const logger = parentLogger.child({
    module: 'UserNotifications::resetNotificationCount',
    userId: req.user?.id,
  });

  logger.trace('Resetting notification count');
  try {
    if (!req.user) {
      logger.warn('Unauthorized, check middleware');
      return res.status(401).json({ error: 'Unauthorized' } as ErrorResponse);
    }
    const user = req.user;
    const unseenNotificationCount = await NotificationService.resetUnseenNotificationCount({ userId: user.id });

    logger.info({ unseenNotificationCount }, 'Successfully reset notification count');
    return res.status(201).json({ message: 'Successfully reset notification count' });
  } catch (error) {
    logger.error({ error }, 'Error creating user notification');
    return res.status(500).json({ error: 'Internal server error' } as ErrorResponse);
  }
};
