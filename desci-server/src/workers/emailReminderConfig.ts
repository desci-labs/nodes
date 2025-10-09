/**
 * Configuration for automated email reminders
 *
 * This file defines the different types of time-based emails that should be sent
 * based on various conditions (deadlines, overdue items, pending actions, etc.)
 */

import { SentEmailType } from '@prisma/client';
import { subDays } from 'date-fns';

import { prisma } from '../client.js';
import { logger as parentLogger } from '../logger.js';
import { sendEmail } from '../services/email/email.js';
import { SciweaveEmailTypes } from '../services/email/sciweaveEmailTypes.js';

const logger = parentLogger.child({ module: 'EmailReminderConfig' });

export type EmailReminderHandler = {
  name: string;
  description: string;
  enabled: boolean;
  handler: () => Promise<{ sent: number; skipped: number; errors: number }>;
};

/**
 * Example handler template - copy this to create new reminder types
 */
// const exampleHandler: EmailReminderHandler = {
//   name: 'Example Handler',
//   description: 'Description of what this handler does',
//   enabled: false,
//   handler: async () => {
//     let sent = 0;
//     let skipped = 0;
//     let errors = 0;
//
//     try {
//       // Query database for conditions
//       // Send emails as needed
//       // Update counters
//     } catch (err) {
//       logger.error({ err }, 'Handler failed');
//       errors++;
//     }
//
//     return { sent, skipped, errors };
//   },
// };

/**
 * Send 14-day inactivity reminder to FREE tier users who:
 * - Have an active FREE plan with non-null useLimit (limited free chats)
 * - Haven't used RESEARCH_ASSISTANT in the last 14 days
 * - Haven't been sent this reminder in the last 30 days
 */
const checkSciweave14DayInactivity: EmailReminderHandler = {
  name: 'Sciweave 14-Day Inactivity',
  description: "Remind FREE tier users who haven't used Sciweave in 14 days",
  enabled: true,
  handler: async () => {
    let sent = 0;
    let skipped = 0;
    let errors = 0;

    try {
      const fourteenDaysAgo = subDays(new Date(), 14);
      const thirtyDaysAgo = subDays(new Date(), 30);

      // Find users with active FREE tier and non-null useLimit
      const freeUsers = await prisma.userFeatureLimit.findMany({
        where: {
          planCodename: 'FREE',
          feature: 'RESEARCH_ASSISTANT',
          isActive: true,
          useLimit: {
            not: null, // Only users with limited free chats, not unlimited
          },
        },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
              receiveSciweaveMarketingEmails: true,
            },
          },
        },
      });

      logger.info({ count: freeUsers.length }, 'Found FREE tier users with limited chats');

      for (const userLimit of freeUsers) {
        const user = userLimit.user;

        try {
          // Skip if user has opted out of marketing emails
          if (!user.receiveSciweaveMarketingEmails) {
            skipped++;
            continue;
          }

          // Check if we've already sent this email in the last 30 days
          const recentEmail = await prisma.sentEmail.findFirst({
            where: {
              userId: user.id,
              emailType: SentEmailType.SCIWEAVE_14_DAY_INACTIVITY,
              createdAt: {
                gte: thirtyDaysAgo,
              },
            },
          });

          if (recentEmail) {
            logger.debug({ userId: user.id }, 'Already sent inactivity email recently, skipping');
            skipped++;
            continue;
          }

          // Check if user has used RESEARCH_ASSISTANT in the last 14 days
          const recentUsage = await prisma.externalApiUsage.findFirst({
            where: {
              userId: user.id,
              apiType: 'RESEARCH_ASSISTANT',
              createdAt: {
                gte: fourteenDaysAgo,
              },
            },
          });

          if (recentUsage) {
            logger.debug({ userId: user.id }, 'User has used service recently, skipping');
            skipped++;
            continue;
          }

          // Check if user has EVER used the service (don't email new users who never tried it)
          const hasEverUsed = await prisma.externalApiUsage.findFirst({
            where: {
              userId: user.id,
              apiType: 'RESEARCH_ASSISTANT',
            },
          });

          if (!hasEverUsed) {
            logger.debug({ userId: user.id }, 'User has never used service, skipping');
            skipped++;
            continue;
          }

          // Send the inactivity email
          await sendEmail({
            type: SciweaveEmailTypes.SCIWEAVE_14_DAY_INACTIVITY,
            payload: {
              email: user.email,
              firstName: user.firstName || undefined,
              lastName: user.lastName || undefined,
            },
          });

          // Record that we sent this email
          await prisma.sentEmail.create({
            data: {
              userId: user.id,
              emailType: SentEmailType.SCIWEAVE_14_DAY_INACTIVITY,
              details: {
                planCodename: userLimit.planCodename,
                feature: userLimit.feature,
                useLimit: userLimit.useLimit,
              },
            },
          });

          logger.info({ userId: user.id, email: user.email }, 'Sent 14-day inactivity email');
          sent++;
        } catch (err) {
          logger.error({ err, userId: user.id }, 'Failed to process inactivity email for user');
          errors++;
        }
      }
    } catch (err) {
      logger.error({ err }, 'Failed to check 14-day inactivity');
      errors++;
    }

    return { sent, skipped, errors };
  },
};

/**
 * All configured email reminder handlers
 * Add your handlers to this array
 */
export const EMAIL_REMINDER_HANDLERS: EmailReminderHandler[] = [
  checkSciweave14DayInactivity,
  // Add more handlers here
];
