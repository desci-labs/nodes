/**
 * Account Deletion Runner
 *
 * Runs as a CronJob to process users whose scheduled deletion date has passed.
 * For each: cancel RevenueCat, cancel Stripe, send finalized email, log ACCOUNT_HARD_DELETED, then hard-delete user data.
 *
 * Usage:
 *   NODE_PATH=./dist node ./dist/workers/accountDeletionRunner.js
 */

import { ActionType } from '@prisma/client';
import { CronJob } from 'cron';

import { prisma } from '../client.js';
import { logger as parentLogger } from '../logger.js';
import { lockService } from '../redisClient.js';
import { hardDeleteUser } from '../services/accountDeletion.js';
import { sendSciweaveEmailService } from '../services/email/sciweaveEmails.js';
import { SciweaveEmailTypes } from '../services/email/sciweaveEmailTypes.js';
import { saveInteractionWithoutReq } from '../services/interactionLog.js';
import { cancelSubscriptionForUser } from '../services/RevenueCatService.js';
import { SubscriptionService } from '../services/SubscriptionService.js';
import { getDueAccountDeletionRequests } from '../services/user.js';

const logger = parentLogger.child({ module: 'AccountDeletionRunner' });

async function runAccountDeletions(): Promise<{ processed: number; errors: number }> {
  const due = await getDueAccountDeletionRequests();
  logger.info({ count: due.length }, 'Processing due account deletions');

  let processed = 0;
  let errors = 0;

  for (const record of due) {
    const { userId, scheduledDeletionAt, id: accountDeletionRequestId } = record;

    let taskLock = false;
    try {
      taskLock = await lockService.aquireLock(`accountDeletion:${accountDeletionRequestId}`);
      if (!taskLock) {
        continue;
      }

      await Promise.all([cancelSubscriptionForUser(userId), SubscriptionService.cancelSubscriptionImmediately(userId)]);

      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { email: true, firstName: true, lastName: true },
      });

      const processedAt = new Date();
      await saveInteractionWithoutReq({
        action: ActionType.ACCOUNT_HARD_DELETED,
        userId,
        data: {
          scheduledDeletionAt: scheduledDeletionAt.toISOString(),
          processedAt: processedAt.toISOString(),
        },
      });

      await hardDeleteUser(userId);
      processed++;

      if (user?.email) {
        try {
          await sendSciweaveEmailService({
            type: SciweaveEmailTypes.SCIWEAVE_ACCOUNT_DELETION_FINALIZED,
            payload: {
              email: user.email,
              firstName: user.firstName ?? undefined,
              lastName: user.lastName ?? undefined,
            },
          });
        } catch (err) {
          logger.warn({ err, userId }, 'Failed to send account deletion finalized email');
        }
      }
      logger.info({ userId }, 'Account deletion finalized');
    } catch (err) {
      logger.error({ err, userId }, 'Failed to process account deletion');
      errors++;
    } finally {
      if (taskLock) {
        await lockService.freeLock(`accountDeletion:${accountDeletionRequestId}`);
      }
    }
  }

  return { processed, errors };
}

async function onTick() {
  const result = await runAccountDeletions();
  logger.info(result, 'Account deletion job completed');
}

export const AccountDeletionRunnerJob = new CronJob(
  // schedule cron to run every hour
  // '* * * * *', // 10 seconds (for local test)
  '0 * * * *', // 1 hour
  onTick, // onTick
  null, // onComplete
  false, // start
);
