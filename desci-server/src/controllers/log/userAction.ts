import { AvailableUserActionLogTypes } from '@desci-labs/desci-models';
import { ActionType, User } from '@prisma/client';
import { Request, Response, NextFunction } from 'express';

import { logger } from '../../logger.js';
import { saveInteraction } from '../../services/interactionLog.js';

/**
 * Note: user not guaranteed
 */
export const logUserAction = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = (req as any).user as User;
    const action = req.body.action as AvailableUserActionLogTypes;
    const message = req.body.message as string;

    if (!action || !AvailableUserActionLogTypes[action]) {
      res.status(400).send({
        logged: false,
        message: 'Invalid action in body',
        availableActions: Object.keys(AvailableUserActionLogTypes),
      });
      return;
    }

    const trimmedUser = user ? { id: user.id, email: user.email } : null;
    const actionData = {
      action,
      message: message || null,
      user: trimmedUser,
    };
    await saveInteraction(req, ActionType.USER_ACTION, actionData, user?.id);

    res.send({
      ok: true,
    });

    return;
  } catch (err) {
    logger.error({ fn: 'logUserAction', err }, 'error');
    res.status(500).send({ err });
    return;
  }
};
