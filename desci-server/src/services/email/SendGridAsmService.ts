/**
 * Service for managing SendGrid ASM (Advanced Suppression Management) groups
 *
 * Handles syncing user email preferences with SendGrid suppression groups
 */
import client from '@sendgrid/client';

import { SENDGRID_API_KEY, SENDGRID_ASM_GROUP_IDS } from '../../config.js';
import { logger as parentLogger } from '../../logger.js';

const logger = parentLogger.child({ module: 'SendGridAsmService' });

if (SENDGRID_API_KEY) {
  client.setApiKey(SENDGRID_API_KEY);
}

export type AppType = 'SCIWEAVE' | 'PUBLISH';

/**
 * Get the marketing ASM group ID for an app type
 */
function getMarketingGroupId(appType: AppType): number {
  return appType === 'SCIWEAVE' ? SENDGRID_ASM_GROUP_IDS.SCIWEAVE_MARKETING : SENDGRID_ASM_GROUP_IDS.PUBLISH_MARKETING;
}

/**
 * Remove an email from a SendGrid suppression group
 * Call this when a user opts back into marketing emails
 *
 * @param email - The email address to unsuppress
 * @param appType - The app type (SCIWEAVE or PUBLISH) to determine which group
 * @returns true if successful or email wasn't suppressed, false on error
 */
export async function removeFromSuppressionGroup(email: string, appType: AppType): Promise<boolean> {
  if (!SENDGRID_API_KEY) {
    logger.warn('SENDGRID_API_KEY not configured, skipping ASM unsuppression');
    return true;
  }

  const groupId = getMarketingGroupId(appType);

  try {
    const request = {
      url: `/v3/asm/groups/${groupId}/suppressions/${encodeURIComponent(email)}`,
      method: 'DELETE' as const,
    };

    const [response] = await client.request(request);

    if (response.statusCode === 204) {
      logger.info({ email, appType, groupId }, 'Successfully removed email from SendGrid suppression group');
      return true;
    }

    logger.warn(
      { email, appType, groupId, statusCode: response.statusCode },
      'Unexpected response when removing from suppression group',
    );
    return true; // Still return true as it might not have been suppressed
  } catch (error: any) {
    // 404 means the email wasn't in the suppression group - that's fine
    if (error?.code === 404 || error?.response?.statusCode === 404) {
      logger.debug({ email, appType, groupId }, 'Email was not in suppression group (404)');
      return true;
    }

    logger.error({ error, email, appType, groupId }, 'Failed to remove email from SendGrid suppression group');
    return false;
  }
}

/**
 * Add an email to a SendGrid suppression group
 * Call this when a user opts out of marketing emails via the app
 * (Note: When they unsubscribe via SendGrid link, SendGrid handles this automatically)
 *
 * @param email - The email address to suppress
 * @param appType - The app type (SCIWEAVE or PUBLISH) to determine which group
 * @returns true if successful, false on error
 */
export async function addToSuppressionGroup(email: string, appType: AppType): Promise<boolean> {
  if (!SENDGRID_API_KEY) {
    logger.warn('SENDGRID_API_KEY not configured, skipping ASM suppression');
    return true;
  }

  const groupId = getMarketingGroupId(appType);

  try {
    const request = {
      url: `/v3/asm/groups/${groupId}/suppressions`,
      method: 'POST' as const,
      body: {
        recipient_emails: [email],
      },
    };

    const [response] = await client.request(request);

    if (response.statusCode === 201) {
      logger.info({ email, appType, groupId }, 'Successfully added email to SendGrid suppression group');
      return true;
    }

    logger.warn(
      { email, appType, groupId, statusCode: response.statusCode },
      'Unexpected response when adding to suppression group',
    );
    return true;
  } catch (error: any) {
    logger.error({ error, email, appType, groupId }, 'Failed to add email to SendGrid suppression group');
    return false;
  }
}

export const SendGridAsmService = {
  removeFromSuppressionGroup,
  addToSuppressionGroup,
};
