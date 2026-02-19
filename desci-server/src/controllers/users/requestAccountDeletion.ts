import { ActionType } from '@prisma/client';
import { addDays, addMinutes } from 'date-fns';
import { Response } from 'express';
import { z } from 'zod';

import { prisma } from '../../client.js';
import { AuthenticatedRequest, ValidatedRequest } from '../../core/types.js';
import { logger as parentLogger } from '../../logger.js';
import { sendSciweaveEmailService } from '../../services/email/sciweaveEmails.js';
import { SciweaveEmailTypes } from '../../services/email/sciweaveEmailTypes.js';
import { saveInteraction } from '../../services/interactionLog.js';
import { isSciweaveUser, getAccountDeletionRequest, createAccountDeletionRequest } from '../../services/user.js';

export const requestAccountDeletionSchema = z.object({
  body: z.object({
    reason: z.string().optional().describe('User-provided reason for requesting account deletion'),
  }),
});

export const requestAccountDeletion = async (
  req: ValidatedRequest<typeof requestAccountDeletionSchema, AuthenticatedRequest>,
  res: Response,
) => {
  const user = req.user;
  const userId = user.id;
  const logger = parentLogger.child({
    module: 'USERS::requestAccountDeletion',
    userId,
    payload: req.validatedData,
  });
  logger.info({ body: req.validatedData }, 'Account deletion requested');
  const reason = req.validatedData.body.reason;

  try {
    const sciweave = await isSciweaveUser(userId);
    if (!sciweave) {
      logger.warn({ userId }, 'Account deletion requested by non-Sciweave user');
      return res.status(403).json({
        ok: false,
        message: 'Account deletion is only available for Sciweave accounts.',
      });
    }

    const existing = await getAccountDeletionRequest(userId);
    if (existing) {
      return res.status(409).json({
        ok: false,
        message: `Deletion already scheduled at ${existing.scheduledDeletionAt.toISOString()}`,
        scheduledDeletionAt: existing.scheduledDeletionAt.toISOString(),
      });
    }

    const scheduledDeletionAt = addDays(new Date(), 30);
    await createAccountDeletionRequest(userId, scheduledDeletionAt, reason);

    if (user?.email) {
      try {
        await sendSciweaveEmailService({
          type: SciweaveEmailTypes.SCIWEAVE_ACCOUNT_DELETION_SCHEDULED,
          payload: {
            email: user.email,
            firstName: user.firstName ?? undefined,
            lastName: user.lastName ?? undefined,
            scheduledDeletionAt,
          },
        });
      } catch (err) {
        logger.warn({ err, userId }, 'Failed to send account deletion scheduled email');
      }
    }

    await saveInteraction({
      req,
      action: ActionType.ACCOUNT_DELETION_REQUESTED,
      data: {
        scheduledDeletionAt: scheduledDeletionAt.toISOString(),
        ...(reason != null ? { reason } : {}),
      },
      userId,
    });

    logger.info({ userId, scheduledDeletionAt }, 'Account deletion scheduled');
    return res.status(200).json({
      ok: true,
      scheduledDeletionAt: scheduledDeletionAt.toISOString(),
    });
  } catch (err) {
    logger.error({ err, userId }, 'Failed to request account deletion');
    return res.status(500).json({ ok: false, message: 'Failed to request account deletion' });
  }
};
