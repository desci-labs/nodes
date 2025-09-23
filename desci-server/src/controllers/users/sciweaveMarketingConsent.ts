import { Response } from 'express';

import { sendError, sendSuccess } from '../../core/api.js';
import { AuthenticatedRequest } from '../../core/types.js';
import { updateUserProperties, AmplitudeAppType } from '../../lib/Amplitude.js';
import { logger as parentLogger } from '../../logger.js';
import { AppType } from '../../services/interactionLog.js';
import { MarketingConsentService } from '../../services/user/Marketing.js';

const logger = parentLogger.child({
  module: 'Users::SciweaveMarketingConsentController',
});

export const updateSciweaveMarketingConsentController = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user.id;
    const { receiveMarketingEmails } = req.body;

    logger.info({ userId, receiveMarketingEmails }, 'Updating Sciweave marketing consent preference');

    // Validate input
    if (typeof receiveMarketingEmails !== 'boolean') {
      return sendError(res, 'receiveMarketingEmails must be a boolean value', 400);
    }

    const result = await MarketingConsentService.updateMarketingConsent({
      userId,
      receiveMarketingEmails,
      appType: AppType.SCIWEAVE,
    });

    if (result.isErr()) {
      const error = result.error;
      logger.error({ error, userId }, 'Failed to update Sciweave marketing consent preference');

      if (error.message.includes('User not found')) {
        return sendError(res, error.message, 404);
      }

      return sendError(res, 'Failed to update Sciweave marketing consent preference', 500);
    }

    const consentData = result.value;

    // Update Amplitude user properties for sciweave app marketing consent
    const amplitudeResult = await updateUserProperties(
      userId,
      {
        receiveSciweaveMarketingEmails: receiveMarketingEmails,
      },
      AmplitudeAppType.SCIWEAVE,
    );

    if (amplitudeResult.isErr()) {
      logger.warn({ error: amplitudeResult.error }, 'Failed to update Amplitude properties');
    }

    return sendSuccess(res, consentData, 'Sciweave marketing consent preference updated successfully');
  } catch (error: any) {
    logger.error({ error, userId: req.user.id }, 'Unhandled error in updateSciweaveMarketingConsentController');
    return sendError(res, 'An unexpected error occurred', 500);
  }
};
