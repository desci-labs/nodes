// /**
//  * Daily Credit Refresh Service
//  * Background job to refresh daily credits for trial users
//  * Should be run periodically (e.g., every hour via cron)
//  */

// import { Feature } from '@prisma/client';
// import { prisma } from '../client.js';
// import { logger } from '../logger.js';

// const DAILY_CREDIT_AMOUNT = 1;

// /**
//  * Refresh daily credits for all eligible trial users
//  * This should be called by a cron job periodically (e.g., every hour)
//  */
// export async function refreshDailyCreditsForTrialUsers(): Promise<void> {
//   const now = new Date();
//   const refreshLogger = logger.child({ module: 'DailyCreditRefresh' });

//   refreshLogger.info('Starting daily credit refresh job');

//   try {
//     // Find all trial users who:
//     // 1. Have an active trial (trialEnd > now)
//     // 2. Have consumed initial credits (totalUsed >= initialTrialCredits)
//     // 3. Have no credits remaining (totalRemaining = 0)
//     // 4. Are due for refresh (nextCreditRefreshTime <= now OR nextCreditRefreshTime is null)
//     const eligibleUsers = await prisma.usage.findMany({
//       where: {
//         feature: Feature.RESEARCH_ASSISTANT,
//         subscription: {
//           trialStart: { not: null },
//           trialEnd: { gt: now }, // Trial still active
//         },
//         totalUsed: {
//           gte: prisma.usage.fields.initialTrialCredits,
//         },
//         OR: [
//           { totalRemaining: 0 },
//           { totalRemaining: null },
//         ],
//         AND: [
//           {
//             OR: [
//               { nextCreditRefreshTime: { lte: now } },
//               { nextCreditRefreshTime: null },
//             ],
//           },
//         ],
//       },
//       include: {
//         subscription: true,
//       },
//     });

//     refreshLogger.info({ count: eligibleUsers.length }, `Found ${eligibleUsers.length} users eligible for daily credit refresh`);

//     let refreshedCount = 0;
//     let skippedCount = 0;

//     for (const usage of eligibleUsers) {
//       try {
//         // Double-check trial is still active
//         if (!usage.subscription?.trialEnd || now >= usage.subscription.trialEnd) {
//           skippedCount++;
//           continue;
//         }

//         // Double-check user has consumed initial credits
//         const initialCredits = usage.initialTrialCredits || 10;
//         if (usage.totalUsed < initialCredits) {
//           skippedCount++;
//           continue;
//         }

//         // Add 1 credit (don't accumulate - max 1 at a time)
//         const newRemaining = DAILY_CREDIT_AMOUNT;

//         // Calculate next refresh time (midnight UTC)
//         const nextRefresh = new Date(now);
//         nextRefresh.setUTCHours(24, 0, 0, 0); // Next midnight UTC

//         await prisma.usage.update({
//           where: { id: usage.id },
//           data: {
//             totalRemaining: newRemaining,
//             nextCreditRefreshTime: nextRefresh,
//           },
//         });

//         refreshedCount++;
//         refreshLogger.debug({ userId: usage.userId }, `Refreshed daily credit for user ${usage.userId}`);
//       } catch (error) {
//         refreshLogger.error({ error, userId: usage.userId }, `Failed to refresh credit for user ${usage.userId}`);
//       }
//     }

//     refreshLogger.info(
//       { refreshed: refreshedCount, skipped: skippedCount },
//       `Daily credit refresh completed: ${refreshedCount} refreshed, ${skippedCount} skipped`
//     );
//   } catch (error) {
//     refreshLogger.error({ error }, 'Error in daily credit refresh job');
//     throw error;
//   }
// }

// /**
//  * Run the daily credit refresh job
//  * Can be called directly or via cron
//  */
// export async function runDailyCreditRefreshJob(): Promise<void> {
//   try {
//     await refreshDailyCreditsForTrialUsers();
//   } catch (error) {
//     logger.error({ error }, 'Daily credit refresh job failed');
//     throw error;
//   }
// }
