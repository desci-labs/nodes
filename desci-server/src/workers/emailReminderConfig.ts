/**
 * Configuration for automated email reminders
 *
 * This file defines the different types of time-based emails that should be sent
 * based on various conditions (deadlines, overdue items, pending actions, etc.)
 */

import { Feature, SentEmailType } from '@prisma/client';
import { subDays, subHours } from 'date-fns';

import { prisma } from '../client.js';
import { SCIWEAVE_USER_DISCOUNT_PERCENT, SENDGRID_API_KEY } from '../config.js';
import { logger as parentLogger } from '../logger.js';
import { sendEmail } from '../services/email/email.js';
import { SciweaveEmailTypes } from '../services/email/sciweaveEmailTypes.js';
import { isUserStudentSciweave } from '../services/interactionLog.js';
import { StripeCouponService } from '../services/StripeCouponService.js';

import { isDryRunMode, recordDryRunEmail } from './emailDryRun.js';
import { getUserNameByUser } from '../services/user.js';

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
 * - Have used RESEARCH_ASSISTANT at least once in the past
 * - Haven't used RESEARCH_ASSISTANT in the last 14 days
 * - Haven't been sent this reminder before (ever)
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

      // Find users with active FREE tier and non-null useLimit
      const freeUsers = await prisma.userFeatureLimit.findMany({
        where: {
          planCodename: 'FREE',
          feature: Feature.RESEARCH_ASSISTANT,
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
              name: true,
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

          // Check if we've ever sent this email before
          const existingEmail = await prisma.sentEmail.findFirst({
            where: {
              userId: user.id,
              emailType: SentEmailType.SCIWEAVE_14_DAY_INACTIVITY,
            },
          });

          if (existingEmail) {
            logger.debug({ userId: user.id }, 'Already sent inactivity email before, skipping');
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
            const { firstName, lastName } = await getUserNameByUser(user);

            const emailResult = await sendEmail({
              type: SciweaveEmailTypes.SCIWEAVE_14_DAY_INACTIVITY,
              payload: {
                email: user.email,
                firstName: firstName || undefined,
                lastName: lastName || undefined,
              },
            });

            // Only record if email was actually sent successfully
            if (emailResult && emailResult.success) {
              await prisma.sentEmail.create({
                data: {
                  userId: user.id,
                  emailType: SentEmailType.SCIWEAVE_14_DAY_INACTIVITY,
                  internalTrackingId: emailResult.internalTrackingId,
                  details: {
                    planCodename: userLimit.planCodename,
                    feature: userLimit.feature,
                    useLimit: userLimit.useLimit,
                    ...(emailResult.sgMessageIdPrefix && {
                      sgMessageIdPrefix: emailResult.sgMessageIdPrefix,
                    }),
                  },
                },
              });
            }
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
              name: true,
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
            const { firstName, lastName } = await getUserNameByUser(user);

            const emailResult = await sendEmail({
              type: SciweaveEmailTypes.SCIWEAVE_PRO_CHAT_REFRESH,
              payload: {
                email: user.email,
                firstName: firstName || undefined,
                lastName: lastName || undefined,
              },
            });

            // Only record if email was actually sent successfully
            if (emailResult && emailResult.success) {
              await prisma.sentEmail.create({
                data: {
                  userId: user.id,
                  emailType: SentEmailType.SCIWEAVE_PRO_CHAT_REFRESH,
                  internalTrackingId: emailResult.internalTrackingId,
                  details: {
                    planCodename: userLimit.planCodename,
                    feature: userLimit.feature,
                    currentPeriodStart: userLimit.currentPeriodStart
                      ? userLimit.currentPeriodStart.toISOString()
                      : null,
                    daysSinceStart,
                    isPeriodExpired,
                    isJustRefreshed,
                    ...(emailResult.sgMessageIdPrefix && {
                      sgMessageIdPrefix: emailResult.sgMessageIdPrefix,
                    }),
                  },
                },
              });
            }
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
      }
      // else {
      const emailResult = await sendEmail({
        type: SciweaveEmailTypes.SCIWEAVE_14_DAY_INACTIVITY,
        payload: {
          email: TEST_EMAIL,
          firstName: 'Test',
          lastName: 'User',
        },
      });
      // }

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
// 24-hour follow-up: Check CTA click status and send appropriate email: SCIWEAVE_OUT_OF_CHATS_NO_CTA or SCIWEAVE_OUT_OF_CHATS_CTA_CLICKED
const checkOutOfChatsFollowUp: EmailReminderHandler = {
  name: 'Out of Chats Follow-Up (Non-Students, CTA-based)',
  description: 'Send follow-up email based on CTA click status 24hrs after hitting limit for non-students',
  enabled: true,
  handler: async () => {
    let sent = 0;
    let skipped = 0;
    let errors = 0;
    try {
      const twentyFourHoursAgo = subHours(new Date(), 24);
      const seventyTwoHoursAgo = subHours(new Date(), 72);

      // Find users who received OUT_OF_CHATS_INITIAL email 24-72 hours ago
      const initialEmails = await prisma.sentEmail.findMany({
        where: {
          emailType: SentEmailType.SCIWEAVE_OUT_OF_CHATS_INITIAL,
          createdAt: {
            gte: seventyTwoHoursAgo,
            lte: twentyFourHoursAgo,
          },
        },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
              name: true,
              receiveSciweaveMarketingEmails: true,
            },
          },
        },
      });

      logger.info({ count: initialEmails.length }, 'Found users for out-of-chats follow-up');

      for (const initialEmail of initialEmails) {
        const { user } = initialEmail;
        if (!user) continue;

        try {
          // Skip if user has opted out of marketing emails
          if (!user.receiveSciweaveMarketingEmails) {
            logger.debug({ userId: user.id }, 'User opted out of marketing emails, skipping');
            skipped++;
            continue;
          }

          // Check if we already sent any follow-up email (either type)
          const existingFollowUp = await prisma.sentEmail.findFirst({
            where: {
              userId: user.id,
              emailType: {
                in: [SentEmailType.SCIWEAVE_OUT_OF_CHATS_NO_CTA, SentEmailType.SCIWEAVE_OUT_OF_CHATS_CTA_CLICKED],
              },
            },
          });

          if (existingFollowUp) {
            logger.debug({ userId: user.id }, 'Already sent follow-up email, skipping');
            skipped++;
            continue;
          }

          // Check if user clicked the CTA in the initial email
          const ctaClicked = (initialEmail.details as any)?.ctaClicked === true;
          const emailTypeToSend = ctaClicked
            ? SentEmailType.SCIWEAVE_OUT_OF_CHATS_CTA_CLICKED
            : SentEmailType.SCIWEAVE_OUT_OF_CHATS_NO_CTA;

          if (isDryRunMode()) {
            recordDryRunEmail({
              userId: user.id,
              email: user.email,
              emailType: ctaClicked ? 'SCIWEAVE_OUT_OF_CHATS_CTA_CLICKED' : 'SCIWEAVE_OUT_OF_CHATS_NO_CTA',
              handlerName: 'Out of Chats Follow-Up (CTA-based)',
              details: { initialEmailId: initialEmail.id, ctaClicked },
            });
            sent++;
            continue;
          }

          // Create 48-hour limited coupon
          const coupon = await StripeCouponService.create48HourCoupon({
            percentOff: SCIWEAVE_USER_DISCOUNT_PERCENT,
            userId: user.id,
            email: user.email,
            emailType: ctaClicked ? 'SCIWEAVE_OUT_OF_CHATS_CTA_CLICKED' : 'SCIWEAVE_OUT_OF_CHATS_NO_CTA',
          });

          let emailResult;

          const { firstName, lastName } = await getUserNameByUser(user);

          if (ctaClicked) {
            // Send CTA clicked follow-up email with coupon
            emailResult = await sendEmail({
              type: SciweaveEmailTypes.SCIWEAVE_OUT_OF_CHATS_CTA_CLICKED,
              payload: {
                email: user.email,
                firstName: firstName || 'Researcher',
                lastName: lastName,
                couponCode: coupon.code,
                percentOff: coupon.percentOff || SCIWEAVE_USER_DISCOUNT_PERCENT,
                expiresAt: coupon.expiresAt!,
              },
            });
          } else {
            // Send follow-up email with coupon for users who didn't click CTA
            emailResult = await sendEmail({
              type: SciweaveEmailTypes.SCIWEAVE_OUT_OF_CHATS_NO_CTA,
              payload: {
                email: user.email,
                firstName: firstName || 'Researcher',
                lastName: lastName,
                couponCode: coupon.code,
                percentOff: coupon.percentOff || SCIWEAVE_USER_DISCOUNT_PERCENT,
                expiresAt: coupon.expiresAt!,
              },
            });
          }

          // Only record if email was actually sent successfully
          if (emailResult && emailResult.success) {
            const emailDetails: any = {
              initialEmailId: initialEmail.id,
              ctaClicked,
              couponCode: coupon.code,
              couponId: coupon.id,
              expiresAt: coupon.expiresAt!.toISOString(),
              ...(emailResult.sgMessageIdPrefix && {
                sgMessageIdPrefix: emailResult.sgMessageIdPrefix,
              }),
            };

            await prisma.sentEmail.create({
              data: {
                userId: user.id,
                emailType: emailTypeToSend,
                internalTrackingId: emailResult.internalTrackingId,
                details: emailDetails,
              },
            });
          }

          logger.info(
            {
              userId: user.id,
              emailType: emailTypeToSend,
              ctaClicked,
              couponCode: coupon.code,
            },
            'Sent out-of-chats follow-up email',
          );
          sent++;
        } catch (err) {
          logger.error({ err, userId: user.id }, 'Failed to process follow-up email for user');
          errors++;
        }
      }
    } catch (err) {
      logger.error({ err }, 'Failed to check out-of-chats follow-up');
      errors++;
    }

    return { sent, skipped, errors };
  },
};

// 24-hour follow-up: STUDENT_DISCOUNT (students) with student coupon
const checkStudentDiscountFollowUp: EmailReminderHandler = {
  name: 'Student Discount Follow-Up',
  description: 'Send student discount to students 24hrs after hitting limit',
  enabled: true,
  handler: async () => {
    let sent = 0;
    let skipped = 0;
    let errors = 0;

    try {
      const twentyFourHoursAgo = subHours(new Date(), 24);
      const seventyTwoHoursAgo = subHours(new Date(), 72);

      // Find students who received STUDENT_DISCOUNT_LIMIT_REACHED email 24-72 hours ago
      const limitReachedEmails = await prisma.sentEmail.findMany({
        where: {
          emailType: SentEmailType.SCIWEAVE_STUDENT_DISCOUNT_LIMIT_REACHED,
          createdAt: {
            gte: seventyTwoHoursAgo,
            lte: twentyFourHoursAgo,
          },
        },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              name: true,
              firstName: true,
              lastName: true,
              receiveSciweaveMarketingEmails: true,
            },
          },
        },
      });

      logger.info({ count: limitReachedEmails.length }, 'Found students for discount follow-up');

      for (const limitEmail of limitReachedEmails) {
        const { user } = limitEmail;
        if (!user) continue;

        try {
          // Skip if user has opted out of marketing emails
          if (!user.receiveSciweaveMarketingEmails) {
            logger.debug({ userId: user.id }, 'User opted out of marketing emails, skipping');
            skipped++;
            continue;
          }

          // Check if we already sent the follow-up email
          const existingFollowUp = await prisma.sentEmail.findFirst({
            where: {
              userId: user.id,
              emailType: SentEmailType.SCIWEAVE_STUDENT_DISCOUNT,
            },
          });

          if (existingFollowUp) {
            logger.debug({ userId: user.id }, 'Already sent student discount email, skipping');
            skipped++;
            continue;
          }

          // Verify they're still a student
          const isStudent = await isUserStudentSciweave(user.id);
          if (!isStudent) {
            logger.warn({ userId: user.id }, 'User no longer identified as student, skipping');
            skipped++;
            continue;
          }

          if (isDryRunMode()) {
            recordDryRunEmail({
              userId: user.id,
              email: user.email,
              emailType: 'SCIWEAVE_STUDENT_DISCOUNT',
              handlerName: 'Student Discount Follow-Up',
              details: { limitEmailId: limitEmail.id },
            });
            sent++;
            continue;
          }

          // Reuse the coupon from the initial limit-reached email
          const existingCouponCode =
            limitEmail.details && typeof limitEmail.details === 'object' && 'couponCode' in limitEmail.details
              ? (limitEmail.details.couponCode as string)
              : undefined;

          const existingPercentOff =
            limitEmail.details && typeof limitEmail.details === 'object' && 'percentOff' in limitEmail.details
              ? (limitEmail.details.percentOff as number)
              : undefined;

          let couponCode: string;
          let percentOff: number | undefined;

          if (existingCouponCode) {
            // Reuse the existing coupon
            couponCode = existingCouponCode;
            percentOff = existingPercentOff;
            logger.info({ userId: user.id, couponCode, percentOff }, 'Reusing existing student discount coupon');
          } else {
            // Fallback: generate new coupon if not found (shouldn't happen normally)
            logger.warn({ userId: user.id }, 'No coupon found in limit email, generating new one');
            const coupon = await StripeCouponService.getStudentDiscountCoupon({
              userId: user.id,
              email: user.email,
            });
            couponCode = coupon.code;
            percentOff = coupon.percentOff;
          }

          const { firstName, lastName } = await getUserNameByUser(user);

          // Send student discount email
          const emailResult = await sendEmail({
            type: SciweaveEmailTypes.SCIWEAVE_STUDENT_DISCOUNT,
            payload: {
              email: user.email,
              firstName: firstName || undefined,
              lastName: lastName || undefined,
              couponCode,
              percentOff,
            },
          });

          // Only record if email was actually sent successfully
          if (emailResult && emailResult.success) {
            await prisma.sentEmail.create({
              data: {
                userId: user.id,
                emailType: SentEmailType.SCIWEAVE_STUDENT_DISCOUNT,
                internalTrackingId: emailResult.internalTrackingId,
                details: {
                  limitEmailId: limitEmail.id,
                  couponCode,
                  ...(emailResult.sgMessageIdPrefix && {
                    sgMessageIdPrefix: emailResult.sgMessageIdPrefix,
                  }),
                },
              },
            });
          }

          logger.info({ userId: user.id, couponCode }, 'Sent student discount email');
          sent++;
        } catch (err) {
          logger.error({ err, userId: user.id }, 'Failed to process student discount email for user');
          errors++;
        }
      }
    } catch (err) {
      logger.error({ err }, 'Failed to check student discount follow-up');
      errors++;
    }

    return { sent, skipped, errors };
  },
};

// Export individual handlers for testing
export {
  checkSciweave14DayInactivity,
  checkProChatRefresh,
  checkOutOfChatsFollowUp,
  checkStudentDiscountFollowUp,
  testEmailHandler,
};

export const EMAIL_REMINDER_HANDLERS: EmailReminderHandler[] = [
  checkSciweave14DayInactivity,
  checkProChatRefresh,
  checkOutOfChatsFollowUp,
  checkStudentDiscountFollowUp,
  testEmailHandler, // Auto-skips unless TEST_EMAIL_ADDRESS is set
  // Add more handlers here
];
