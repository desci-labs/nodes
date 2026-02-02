import { ActionType } from '@prisma/client';
import { ok, err, Result } from 'neverthrow';

import { prisma } from '../../client.js';
import { logger as parentLogger } from '../../logger.js';
import { SendGridAsmService } from '../email/SendGridAsmService.js';
import { saveInteractionWithoutReq, AppType } from '../interactionLog.js';

const logger = parentLogger.child({
  module: 'Services::User::Marketing',
});

export interface UpdateMarketingConsentInput {
  userId: number;
  receiveMarketingEmails: boolean;
  appType?: AppType;
  /** Optional source identifier - only present for webhook-based unsubscribes (e.g. 'sendgrid_webhook') */
  source?: string;
}

/**
 * Update user's marketing email consent preference
 */
async function updateMarketingConsent(
  input: UpdateMarketingConsentInput,
): Promise<Result<{ receiveMarketingEmails: boolean }, Error>> {
  const { userId, receiveMarketingEmails, appType = AppType.PUBLISH, source = 'app' } = input;

  logger.info({ userId, receiveMarketingEmails, appType, source }, 'Updating marketing consent preference');

  const isSciweaveApp = appType === AppType.SCIWEAVE;
  const fieldName = isSciweaveApp ? 'receiveSciweaveMarketingEmails' : 'receiveMarketingEmails';

  try {
    const existingUser = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        receiveMarketingEmails: true,
        receiveSciweaveMarketingEmails: true,
      },
    });

    if (!existingUser) {
      logger.warn({ userId }, 'User not found');
      return err(new Error('User not found'));
    }

    // Get current value based on app type
    const currentValue = isSciweaveApp
      ? existingUser.receiveSciweaveMarketingEmails
      : existingUser.receiveMarketingEmails;

    // If the preference is the same as current, no need to update
    if (currentValue === receiveMarketingEmails) {
      logger.info({ userId, receiveMarketingEmails, appType }, 'Marketing consent preference unchanged');
      return ok({ receiveMarketingEmails });
    }

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: { [fieldName]: receiveMarketingEmails },
      select: { receiveMarketingEmails: true, receiveSciweaveMarketingEmails: true, email: true },
    });

    // Choose correct action type based on app type
    const actionType = isSciweaveApp
      ? receiveMarketingEmails
        ? ActionType.SCIWEAVE_MARKETING_EMAIL_OPT_IN
        : ActionType.SCIWEAVE_MARKETING_EMAIL_OPT_OUT
      : receiveMarketingEmails
        ? ActionType.MARKETING_EMAIL_OPT_IN
        : ActionType.MARKETING_EMAIL_OPT_OUT;

    await saveInteractionWithoutReq({
      action: actionType,
      data: {
        userId,
        email: updatedUser.email,
        receiveMarketingEmails,
        previousValue: currentValue,
        appType,
        source,
      },
      userId,
      submitToMixpanel: true,
    });

    // Sync with SendGrid ASM suppression groups (skip if change came from SendGrid webhook)
    if (source !== 'sendgrid_webhook') {
      const sendGridAppType = isSciweaveApp ? 'SCIWEAVE' : 'PUBLISH';

      if (receiveMarketingEmails) {
        // User opted IN - remove from suppression group so they receive emails
        await SendGridAsmService.removeFromSuppressionGroup(updatedUser.email, sendGridAppType);
      } else {
        // User opted OUT - add to suppression group
        await SendGridAsmService.addToSuppressionGroup(updatedUser.email, sendGridAppType);
      }
    }

    logger.info(
      { userId, receiveMarketingEmails, previousValue: currentValue, appType, source },
      'Successfully updated marketing consent preference',
    );

    return ok({ receiveMarketingEmails });
  } catch (error) {
    logger.error({ error, userId, receiveMarketingEmails, appType }, 'Failed to update marketing consent preference');
    return err(error instanceof Error ? error : new Error('Failed to update marketing consent preference'));
  }
}

export const MarketingConsentService = {
  updateMarketingConsent,
};
