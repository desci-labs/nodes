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

import { isDryRunMode, recordDryRunEmail } from './emailDryRun.js';

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

          // Send the inactivity email (or record for dry run)
          if (isDryRunMode()) {
            recordDryRunEmail({
              userId: user.id,
              email: user.email,
              emailType: 'SCIWEAVE_14_DAY_INACTIVITY',
              handlerName: 'Sciweave 14-Day Inactivity',
              details: {
                planCodename: userLimit.planCodename,
                feature: userLimit.feature,
                useLimit: userLimit.useLimit,
              },
            });
          } else {
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
          }

          logger.info({ userId: user.id, email: user.email, dryRun: isDryRunMode() }, 'Sent 14-day inactivity email');
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
 * Send chat refresh notification to PRO/PREMIUM users when:
 * - Their currentPeriodStart is >30 days old (period expired but not refreshed yet), OR
 * - Their currentPeriodStart is 0-1 days old (just refreshed/rolled over)
 * - We haven't sent this email in the last 30 days
 */
const checkProChatRefresh: EmailReminderHandler = {
  name: 'Pro Chat Refresh Notification',
  description: 'Notify PRO users when their chat usage has been reset',
  enabled: true,
  handler: async () => {
    let sent = 0;
    let skipped = 0;
    let errors = 0;

    try {
      const now = new Date();
      const thirtyDaysAgo = subDays(now, 30);
      const oneDayAgo = subDays(now, 1);

      // Find active PRO/PREMIUM/STARTER plans with RESEARCH_ASSISTANT feature
      const proUsers = await prisma.userFeatureLimit.findMany({
        where: {
          planCodename: {
            in: ['PRO', 'PREMIUM', 'STARTER'],
          },
          feature: 'RESEARCH_ASSISTANT',
          isActive: true,
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

      logger.info({ count: proUsers.length }, 'Found PRO/PREMIUM users with active plans');

      for (const userLimit of proUsers) {
        const user = userLimit.user;

        try {
          // Skip if user has opted out of marketing emails
          if (!user.receiveSciweaveMarketingEmails) {
            skipped++;
            continue;
          }

          const currentPeriodStart = new Date(userLimit.currentPeriodStart);
          const daysSinceStart = Math.floor((now.getTime() - currentPeriodStart.getTime()) / (1000 * 60 * 60 * 24));

          // Check if period is either >30 days old OR 0-1 days old (just refreshed)
          const isPeriodExpired = daysSinceStart > 30;
          const isJustRefreshed = daysSinceStart >= 0 && daysSinceStart <= 1;

          if (!isPeriodExpired && !isJustRefreshed) {
            logger.debug({ userId: user.id, daysSinceStart }, 'Period not expired and not just refreshed, skipping');
            skipped++;
            continue;
          }

          // Check if we've already sent this email in the last 30 days
          const recentEmail = await prisma.sentEmail.findFirst({
            where: {
              userId: user.id,
              emailType: SentEmailType.SCIWEAVE_PRO_CHAT_REFRESH,
              createdAt: {
                gte: thirtyDaysAgo,
              },
            },
          });

          if (recentEmail) {
            logger.debug({ userId: user.id }, 'Already sent chat refresh email recently, skipping');
            skipped++;
            continue;
          }

          // Send the chat refresh notification (or record for dry run)
          if (isDryRunMode()) {
            recordDryRunEmail({
              userId: user.id,
              email: user.email,
              emailType: 'SCIWEAVE_PRO_CHAT_REFRESH',
              handlerName: 'Pro Chat Refresh Notification',
              details: {
                planCodename: userLimit.planCodename,
                feature: userLimit.feature,
                daysSinceStart,
                isPeriodExpired,
                isJustRefreshed,
              },
            });
          } else {
            await sendEmail({
              type: SciweaveEmailTypes.SCIWEAVE_PRO_CHAT_REFRESH,
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
                emailType: 'SCIWEAVE_PRO_CHAT_REFRESH' as any, // Will be typed after prisma generate
                details: {
                  planCodename: userLimit.planCodename,
                  feature: userLimit.feature,
                  currentPeriodStart: userLimit.currentPeriodStart.toISOString(),
                  daysSinceStart,
                  isPeriodExpired,
                  isJustRefreshed,
                },
              },
            });
          }

          logger.info(
            {
              userId: user.id,
              email: user.email,
              daysSinceStart,
              isPeriodExpired,
              isJustRefreshed,
              dryRun: isDryRunMode(),
            },
            'Sent chat refresh notification',
          );
          sent++;
        } catch (err) {
          logger.error({ err, userId: user.id }, 'Failed to process chat refresh notification for user');
          errors++;
        }
      }
    } catch (err) {
      logger.error({ err }, 'Failed to check pro chat refresh');
      errors++;
    }

    return { sent, skipped, errors };
  },
};

/**
 * TEST HANDLER - Send a test email to verify the system works
 *
 * Usage:
 *   Local: TEST_EMAIL_ADDRESS=your@email.com npm run script:email-reminders
 *   K8s: See README.md for kubectl command with env override
 *
 * Automatically enabled when TEST_EMAIL_ADDRESS env var is set
 */
const testEmailHandler: EmailReminderHandler = {
  name: 'Test Email Handler',
  description: 'Send a test email to verify the cron job works',
  enabled: true,
  handler: async () => {
    let sent = 0;
    let skipped = 0;
    let errors = 0;

    try {
      const TEST_EMAIL = process.env.TEST_EMAIL_ADDRESS;

      if (!TEST_EMAIL) {
        logger.debug('TEST_EMAIL_ADDRESS not set, skipping test email handler');
        skipped++;
        return { sent, skipped, errors };
      }

      logger.info({ testEmail: TEST_EMAIL }, 'Sending test email');

      // Send test email (or record for dry run)
      if (isDryRunMode()) {
        recordDryRunEmail({
          userId: -1, // Test user doesn't have a real ID
          email: TEST_EMAIL,
          emailType: 'SCIWEAVE_14_DAY_INACTIVITY',
          handlerName: 'Test Email Handler',
          details: { test: true },
        });
      } else {
        await sendEmail({
          type: SciweaveEmailTypes.SCIWEAVE_14_DAY_INACTIVITY,
          payload: {
            email: TEST_EMAIL,
            firstName: 'Test',
            lastName: 'User',
          },
        });
      }

      logger.info({ testEmail: TEST_EMAIL, dryRun: isDryRunMode() }, 'Test email sent successfully');
      sent++;
    } catch (err) {
      logger.error({ err }, 'Failed to send test email');
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
  checkProChatRefresh,
  testEmailHandler, // Auto-skips unless TEST_EMAIL_ADDRESS is set
  // Add more handlers here
];
