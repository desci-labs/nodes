import { SentEmailType } from '@prisma/client';

import { prisma } from '../../client.js';
import { logger as parentLogger } from '../../logger.js';

const logger = parentLogger.child({ module: 'EmailHelpers' });

/**
 * Check if a specific email type has been sent to a user before
 * @param emailType - The type of email to check
 * @param userId - The user ID to check for
 * @returns true if the email was sent before, false otherwise
 */
export const hasEmailBeenSent = async (emailType: SentEmailType, userId: number): Promise<boolean> => {
  try {
    const existingEmail = await prisma.sentEmail.findFirst({
      where: {
        userId,
        emailType,
      },
    });

    return existingEmail !== null;
  } catch (error) {
    logger.error({ error, emailType, userId }, 'Failed to check if email was sent before');
    throw error;
  }
};

/**
 * Record that an email was sent to a user
 * @param emailType - The type of email that was sent
 * @param userId - The user ID who received the email
 * @param details - Optional additional details to store with the record
 * @param internalTrackingId - Optional internal tracking ID for webhook correlation
 */
export const recordSentEmail = async (
  emailType: SentEmailType,
  userId: number,
  details?: Record<string, any>,
  internalTrackingId?: string,
): Promise<void> => {
  try {
    await prisma.sentEmail.create({
      data: {
        userId,
        emailType,
        internalTrackingId,
        details: details || undefined,
      },
    });

    logger.debug({ emailType, userId, internalTrackingId }, 'Recorded sent email');
  } catch (error) {
    logger.error({ error, emailType, userId }, 'Failed to record sent email');
    throw error;
  }
};
