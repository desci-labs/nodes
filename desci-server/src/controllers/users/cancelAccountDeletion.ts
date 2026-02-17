import { ActionType } from '@prisma/client';
import { Response } from 'express';

import { prisma } from '../../client.js';
import { AuthenticatedRequest } from '../../core/types.js';
import { logger as parentLogger } from '../../logger.js';
import { sendMagicLink } from '../../services/auth.js';
import { sendSciweaveEmailService } from '../../services/email/sciweaveEmails.js';
import { SciweaveEmailTypes } from '../../services/email/sciweaveEmailTypes.js';
import { saveInteraction } from '../../services/interactionLog.js';
import { getAccountDeletionRequest, deleteAccountDeletionRequest } from '../../services/user.js';

export const cancelAccountDeletion = async (req: AuthenticatedRequest, res: Response) => {
  const user = req.user;
  const userId = req.user.id;
  const logger = parentLogger.child({
    module: 'USERS::cancelAccountDeletion',
    userId,
  });

  try {
    const existing = await getAccountDeletionRequest(userId);
    if (!existing) {
      return res.status(200).json({
        ok: true,
        message: 'No deletion scheduled',
      });
    }

    await deleteAccountDeletionRequest(userId);

    let magicCodeSent = false;
    let reactivationEmailSent = false;
    if (user?.email) {
      // 1. Reactivation email – notify user their account was reactivated
      try {
        await sendSciweaveEmailService({
          type: SciweaveEmailTypes.SCIWEAVE_ACCOUNT_DELETION_REACTIVATED,
          payload: {
            email: user.email,
            firstName: user.firstName ?? undefined,
            lastName: user.lastName ?? undefined,
          },
        });
        reactivationEmailSent = true;
      } catch (err) {
        logger.warn({ err, userId }, 'Failed to send account reactivated email');
      }
      // 2. Magic code email – so they can log in again
      try {
        await sendMagicLink(user.email, req.ip, undefined, true);
        magicCodeSent = true;
      } catch (err) {
        logger.warn({ err, userId }, 'Failed to send magic code after canceling deletion');
      }
    }

    await saveInteraction({
      req,
      action: ActionType.ACCOUNT_DELETION_CANCELLED,
      data: { magicCodeSent, reactivationEmailSent },
      userId,
    });

    logger.info({ userId }, 'Account deletion cancelled');
    return res.status(200).json({
      ok: true,
      cancelled: true,
      magicCodeSent,
      reactivationEmailSent,
    });
  } catch (err) {
    logger.error({ err, userId }, 'Failed to cancel account deletion');
    return res.status(500).json({ ok: false, message: 'Failed to cancel account deletion' });
  }
};
