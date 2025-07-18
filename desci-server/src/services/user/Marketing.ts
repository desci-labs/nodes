import { ActionType } from '@prisma/client';
import { ok, err, Result } from 'neverthrow';

import { prisma } from '../../client.js';
import { logger as parentLogger } from '../../logger.js';
import { saveInteractionWithoutReq } from '../interactionLog.js';

const logger = parentLogger.child({
  module: 'Services::User::Marketing',
});

export interface UpdateMarketingConsentInput {
  userId: number;
  receiveMarketingEmails: boolean;
}

/**
 * Update user's marketing email consent preference
 */
async function updateMarketingConsent(
  input: UpdateMarketingConsentInput,
): Promise<Result<{ receiveMarketingEmails: boolean }, Error>> {
  const { userId, receiveMarketingEmails } = input;

  logger.info({ userId, receiveMarketingEmails }, 'Updating marketing consent preference');

  try {
    const existingUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, receiveMarketingEmails: true },
    });

    if (!existingUser) {
      logger.warn({ userId }, 'User not found');
      return err(new Error('User not found'));
    }

    // If the preference is the same as current, no need to update
    if (existingUser.receiveMarketingEmails === receiveMarketingEmails) {
      logger.info({ userId, receiveMarketingEmails }, 'Marketing consent preference unchanged');
      return ok({ receiveMarketingEmails });
    }

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: { receiveMarketingEmails },
      select: { receiveMarketingEmails: true, email: true },
    });

    const actionType = receiveMarketingEmails ? ActionType.MARKETING_EMAIL_OPT_IN : ActionType.MARKETING_EMAIL_OPT_OUT;

    await saveInteractionWithoutReq({
      action: actionType,
      data: {
        userId,
        email: updatedUser.email,
        receiveMarketingEmails,
        previousValue: existingUser.receiveMarketingEmails,
      },
      userId,
      submitToMixpanel: true,
    });

    logger.info(
      { userId, receiveMarketingEmails, previousValue: existingUser.receiveMarketingEmails },
      'Successfully updated marketing consent preference',
    );

    return ok({ receiveMarketingEmails: updatedUser.receiveMarketingEmails });
  } catch (error) {
    logger.error({ error, userId, receiveMarketingEmails }, 'Failed to update marketing consent preference');
    return err(error instanceof Error ? error : new Error('Failed to update marketing consent preference'));
  }
}

export const MarketingConsentService = {
  updateMarketingConsent,
};
