/**
 * Subscription and Usage Service
 * Handles trial logic, credit management, and subscription status
 */

import { Feature, PlanCodename, PlanType, SubscriptionStatus } from '@prisma/client';

import { prisma } from '../client.js';
import { logger } from '../logger.js';

import { FeatureLimitsService } from './FeatureLimits/FeatureLimitsService.js';

const TRIAL_DURATION_DAYS = 7;
const INITIAL_TRIAL_CREDITS = 10;
const DAILY_CREDIT_AMOUNT = 1;

// Cutoff date for new trial model - users created after this date get new trial model
// Set this to the deployment date of the new trial system
const NEW_TRIAL_MODEL_CUTOFF_DATE = new Date('2024-01-01T00:00:00Z'); // Update this to actual deployment date

export interface UsageData {
  totalLimit: number | null;
  totalUsed: number;
  totalRemaining: number | null;
  planCodename: string;
  isWithinLimit: boolean;
  trialStart?: string | null;
  trialEnd?: string | null;
  isTrialActive?: boolean;
  isTrialExpired?: boolean;
  initialTrialCredits?: number;
  nextCreditRefreshTime?: string | null;
}

/**
 * Check if user should be on new trial model
 * Only applies to users created after the cutoff date
 */
export function shouldUseNewTrialModel(userCreatedAt: Date): boolean {
  return userCreatedAt >= NEW_TRIAL_MODEL_CUTOFF_DATE;
}

/**
 * Initialize trial for new user signup
 * Sets up 7-day trial with 10 initial credits
 */
export async function initializeTrialForNewUser(userId: number): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
  });

  if (!user) {
    throw new Error(`User ${userId} not found`);
  }

  // Only initialize trial for users created after cutoff date
  if (!shouldUseNewTrialModel(user.createdAt)) {
    logger.info(`User ${userId} created before cutoff date, skipping new trial model`);
    return;
  }

  // Check if subscription already exists
  const existingSubscription = await prisma.subscription.findFirst({
    where: { userId, status: SubscriptionStatus.ACTIVE, currentPeriodEnd: { gt: new Date() } },
  });

  if (existingSubscription) {
    logger.info(`Subscription already exists for user ${userId}`);
    return;
  }

  await FeatureLimitsService.getOrCreateUserFeatureLimit(userId, Feature.RESEARCH_ASSISTANT);

  logger.info(`Initialized trial for user ${userId}`);
}

/**
 * Get usage data for a user
 * Handles trial logic, daily credit refresh, and expiration checks
 */
// export async function getUserUsageData(userId: number): Promise<UsageData | null> {
//   const user = await prisma.user.findUnique({
//     where: { id: userId },
//     include: {
//       Subscription: {
//         include: {
//           Usage: {
//             where: {
//               feature: 'RESEARCH_ASSISTANT',
//             },
//           },
//         },
//       },
//     },
//   });

//   if (!user) {
//     return null;
//   }

//   const subscription = user.Subscription;
//   const usage = subscription?.Usage?.[0];

//   // If no subscription exists, check if user should get trial
//   if (!subscription) {
//     // Only initialize trial for new users (after cutoff date)
//     if (shouldUseNewTrialModel(user.createdAt)) {
//       await initializeTrialForNewUser(userId);
//       // Recursively call to get the newly created data
//       return getUserUsageData(userId);
//     }
//     // Old users without subscription get default free plan
//     return {
//       totalLimit: null,
//       totalUsed: 0,
//       totalRemaining: null,
//       planCodename: PlanCodename.FREE,
//       isWithinLimit: true,
//     };
//   }

//   // Check if trial has expired
//   const now = new Date();
//   const isTrialExpired = subscription.trialEnd ? now >= subscription.trialEnd : false;
//   const isTrialActive =
//     subscription.trialStart && subscription.trialEnd
//       ? now >= subscription.trialStart && now < subscription.trialEnd
//       : false;

//   // If trial expired, mark it as expired
//   if (isTrialExpired && subscription.trialStart && subscription.trialEnd) {
//     // Update subscription if needed (idempotent)
//     if (subscription.trialStart) {
//       await prisma.subscription.update({
//         where: { id: subscription.id },
//         data: {
//           // Keep trialStart and trialEnd for historical record
//         },
//       });
//     }
//   }

//   // Handle daily credit refresh for trial users
//   if (isTrialActive && usage) {
//     await refreshDailyCreditIfNeeded(userId, usage, subscription);
//     // Reload usage after potential refresh
//     const updatedUsage = await prisma.usage.findUnique({
//       where: { id: usage.id },
//     });
//     if (updatedUsage) {
//       return formatUsageData(updatedUsage, subscription);
//     }
//   }

//   if (!usage) {
//     // Create default usage if it doesn't exist
//     const newUsage = await prisma.usage.create({
//       data: {
//         userId,
//         subscriptionId: subscription.id,
//         feature: Feature.RESEARCH_ASSISTANT,
//         totalLimit: subscription.planType === PlanType.PREMIUM ? null : 20, // Old model default
//         totalUsed: 0,
//         totalRemaining: subscription.planType === PlanType.PREMIUM ? null : 20,
//         planCodename: subscription.planType === PlanType.PREMIUM ? PlanCodename.PREMIUM : PlanCodename.FREE,
//       },
//     });
//     return formatUsageData(newUsage, subscription);
//   }

//   return formatUsageData(usage, subscription);
// }

/**
 * Refresh daily credit if conditions are met
 * Only for trial users who have consumed initial 10 credits
 */
// async function refreshDailyCreditIfNeeded(
//   userId: number,
//   usage: {
//     id: number;
//     totalUsed: number;
//     totalRemaining: number | null;
//     initialTrialCredits: number | null;
//     nextCreditRefreshTime: Date | null;
//   },
//   subscription: { trialEnd: Date | null; trialStart: Date | null },
// ): Promise<void> {
//   // Only refresh for trial users
//   if (!subscription.trialStart || !subscription.trialEnd) {
//     return;
//   }

//   const now = new Date();
//   const trialEnd = subscription.trialEnd;

//   // Don't refresh if trial has expired
//   if (now >= trialEnd) {
//     return;
//   }

//   // Only refresh if user has consumed initial credits
//   const initialCredits = usage.initialTrialCredits || INITIAL_TRIAL_CREDITS;
//   if (usage.totalUsed < initialCredits) {
//     return;
//   }

//   // Check if it's time for daily refresh
//   if (usage.nextCreditRefreshTime && now >= usage.nextCreditRefreshTime) {
//     // Add 1 credit (don't accumulate - max 1 at a time)
//     const newRemaining = Math.min((usage.totalRemaining || 0) + DAILY_CREDIT_AMOUNT, DAILY_CREDIT_AMOUNT);

//     // Calculate next refresh time (midnight UTC)
//     const nextRefresh = new Date(now);
//     nextRefresh.setUTCHours(24, 0, 0, 0); // Next midnight UTC

//     await prisma.usage.update({
//       where: { id: usage.id },
//       data: {
//         totalRemaining: newRemaining,
//         nextCreditRefreshTime: nextRefresh,
//       },
//     });

//     logger.info(`Refreshed daily credit for user ${userId}: ${newRemaining} credits remaining`);
//   } else if (!usage.nextCreditRefreshTime && usage.totalRemaining === 0) {
//     // Set next refresh time if not set and user has no credits
//     const nextRefresh = new Date(now);
//     nextRefresh.setUTCHours(24, 0, 0, 0); // Next midnight UTC

//     await prisma.usage.update({
//       where: { id: usage.id },
//       data: {
//         nextCreditRefreshTime: nextRefresh,
//       },
//     });
//   }
// }

// /**
//  * Format usage data for API response
//  */
// function formatUsageData(
//   usage: {
//     totalLimit: number | null;
//     totalUsed: number;
//     totalRemaining: number | null;
//     planCodename: string;
//     initialTrialCredits: number | null;
//     nextCreditRefreshTime: Date | null;
//   },
//   subscription: {
//     trialStart: Date | null;
//     trialEnd: Date | null;
//     planType: string;
//   },
// ): UsageData {
//   const now = new Date();
//   const isTrialActive =
//     subscription.trialStart && subscription.trialEnd
//       ? now >= subscription.trialStart && now < subscription.trialEnd
//       : false;
//   const isTrialExpired = subscription.trialEnd ? now >= subscription.trialEnd : false;

//   return {
//     totalLimit: usage.totalLimit,
//     totalUsed: usage.totalUsed,
//     totalRemaining: usage.totalRemaining,
//     planCodename:
//       (usage.planCodename as PlanCodename) ||
//       (subscription.planType === PlanType.PREMIUM ? PlanCodename.PREMIUM : PlanCodename.FREE),
//     isWithinLimit: usage.totalRemaining === null || (usage.totalRemaining ?? 0) > 0,
//     trialStart: subscription.trialStart?.toISOString() || null,
//     trialEnd: subscription.trialEnd?.toISOString() || null,
//     isTrialActive: isTrialActive && subscription.planType === PlanType.FREE,
//     isTrialExpired,
//     initialTrialCredits: usage.initialTrialCredits || undefined,
//     nextCreditRefreshTime: usage.nextCreditRefreshTime?.toISOString() || null,
//   };
// }

// /**
//  * Consume a credit for a user
//  * Returns true if credit was consumed, false if no credits available
//  */
// export async function consumeCredit(userId: number, feature: Feature = Feature.RESEARCH_ASSISTANT): Promise<boolean> {
//   const usage = await prisma.usage.findUnique({
//     where: {
//       userId_feature: {
//         userId,
//         feature: feature as Feature,
//       },
//     },
//     include: {
//       subscription: true,
//     },
//   });

//   if (!usage) {
//     // Try to get or create usage data
//     const usageData = await getUserUsageData(userId);
//     if (!usageData || (usageData.totalRemaining !== null && usageData.totalRemaining <= 0)) {
//       return false;
//     }
//     // Retry after ensuring usage exists
//     return consumeCredit(userId, feature);
//   }

//   // Check if user has credits
//   if (usage.totalRemaining !== null && usage.totalRemaining <= 0) {
//     return false;
//   }

//   // Consume credit
//   await prisma.usage.update({
//     where: { id: usage.id },
//     data: {
//       totalUsed: { increment: 1 },
//       totalRemaining: usage.totalRemaining !== null ? Math.max(0, (usage.totalRemaining || 0) - 1) : null,
//     },
//   });

//   // If trial user consumed initial credits, set next refresh time
//   if (usage.subscription?.trialStart && usage.initialTrialCredits) {
//     const updatedUsage = await prisma.usage.findUnique({
//       where: { id: usage.id },
//     });

//     if (updatedUsage && updatedUsage.totalUsed >= usage.initialTrialCredits && updatedUsage.totalRemaining === 0) {
//       const nextRefresh = new Date();
//       nextRefresh.setUTCHours(24, 0, 0, 0); // Next midnight UTC

//       await prisma.usage.update({
//         where: { id: usage.id },
//         data: {
//           nextCreditRefreshTime: nextRefresh,
//         },
//       });
//     }
//   }

//   return true;
// }
