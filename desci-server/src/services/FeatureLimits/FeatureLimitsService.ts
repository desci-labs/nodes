import { PlanCodename, Feature, Period, UserFeatureLimit, ExternalApi } from '@prisma/client';
import { addDays, addWeeks, addMonths, addYears, isAfter, isBefore } from 'date-fns';
import { ok, err, Result } from 'neverthrow';

import { prisma } from '../../client.js';
import { SCIWEAVE_FREE_LIMIT } from '../../config.js';
import { logger as parentLogger } from '../../logger.js';

import { FEATURE_LIMIT_DEFAULTS } from './constants.js';

const logger = parentLogger.child({ module: 'FeatureLimitsService' });

export interface FeatureLimitStatus {
  useLimit: number | null; // null = unlimited
  currentUsage: number;
  remainingUses: number | null; // null = unlimited
  planCodename: PlanCodename;
  isWithinLimit: boolean;
}

/**
 * Check if a user is within their feature limit
 */
async function checkFeatureLimit(userId: number, feature: Feature): Promise<Result<FeatureLimitStatus, Error>> {
  try {
    // Get or create user feature limit
    const userLimit = await getOrCreateUserFeatureLimit(userId, feature);
    if (userLimit.isErr()) {
      return err(userLimit.error);
    }

    const limit = userLimit.value;

    // Check if we need to reset the period (for automatic period rollover)
    let updatedLimit = await checkAndResetPeriodIfNeeded(limit);

    // Get current usage from the fixed period start - delegate to feature-specific services
    let currentUsage = 0;
    if (feature === Feature.REFEREE_FINDER) {
      const { RefereeRecommenderService } = await import('../externalApi/RefereeRecommenderService.js');
      currentUsage = await RefereeRecommenderService.getUserUsageCountFromDate(userId, updatedLimit.currentPeriodStart);
    } else if (feature === Feature.RESEARCH_ASSISTANT) {
      // Count simple usage rows for research assistant since period start
      currentUsage = await prisma.externalApiUsage.count({
        where: {
          userId,
          apiType: ExternalApi.RESEARCH_ASSISTANT,
          createdAt: { gte: updatedLimit.currentPeriodStart },
        },
      });

      // Add daily credit to the limit for research assistant
      // if (feature === Feature.RESEARCH_ASSISTANT) {
      const dailyCreditResult = await addDailyCreditToUserFeatureLimit(updatedLimit, currentUsage);
      if (dailyCreditResult.isErr()) {
        return err(dailyCreditResult.error);
      }
      updatedLimit = dailyCreditResult.value;
      // }
    }

    // Calculate remaining uses
    const remainingUses = updatedLimit.useLimit === null ? null : Math.max(0, updatedLimit.useLimit - currentUsage);

    // Check if within limit
    const isWithinLimit = updatedLimit.useLimit === null || currentUsage < updatedLimit.useLimit;

    const status: FeatureLimitStatus = {
      useLimit: updatedLimit.useLimit,
      currentUsage,
      remainingUses,
      planCodename: updatedLimit.planCodename,
      isWithinLimit,
    };

    logger.debug({ userId, feature, period: updatedLimit.period, status }, 'Feature limit check completed');
    return ok(status);
  } catch (error) {
    logger.error({ error, userId, feature }, 'Failed to check feature limit');
    return err(error instanceof Error ? error : new Error('Failed to check feature limit'));
  }
}

async function addDailyCreditToUserFeatureLimit(
  limit: UserFeatureLimit,
  currentUsage: number,
): Promise<Result<UserFeatureLimit, Error>> {
  try {
    logger.info(
      {
        currentUsage,
        useLimit: limit.useLimit,
        sciweaveFreeLimit: SCIWEAVE_FREE_LIMIT,
        currentPeriodStart: limit.currentPeriodStart,
      },
      'addDailyCreditToUserFeatureLimit::start',
    );

    if (limit.feature !== Feature.RESEARCH_ASSISTANT) {
      return ok(limit);
    }

    // Don't add daily credit for unlimited plans (null useLimit)
    if (limit.useLimit === null || currentUsage < SCIWEAVE_FREE_LIMIT) {
      return ok(limit);
    }

    const trialEndDate = addDays(limit.currentPeriodStart, 7);
    const now = new Date();

    const todayStart = new Date(now.setHours(0, 0, 0, 0));
    // if the limit was updated in the last 24 hours, don't add a daily credit
    // if the next period start is in the future, don't add a daily credit
    const isAfterTrialEndDate = isAfter(new Date(), trialEndDate);
    const hasBeenUpdatedToday = isAfter(limit.updatedAt, todayStart);
    logger.info(
      {
        trialEndDate,
        todayStart,
        useLimit: limit.useLimit,
        sciweaveFreeLimit: SCIWEAVE_FREE_LIMIT,
        currentPeriodStart: limit.currentPeriodStart,
        isAfterTrialEndDate,
        hasBeenUpdatedToday,
      },
      'addDailyCreditToUserFeatureLimit: before check',
    );
    if (isAfterTrialEndDate || hasBeenUpdatedToday) {
      return ok(limit);
    }

    logger.info({ isAfterTrialEndDate, hasBeenUpdatedToday }, 'addDailyCreditToUserFeatureLimit: after check');

    const updatedLimit = await prisma.userFeatureLimit.update({
      where: { id: limit.id },
      data: { useLimit: limit.useLimit + 1 },
    });
    logger.info(
      {
        userId: limit.userId,
        feature: limit.feature,
        previousUseLimit: limit.useLimit,
        newUseLimit: updatedLimit.useLimit,
      },
      'addDailyCreditToUserFeatureLimit::success',
    );
    return ok(updatedLimit);
  } catch (error) {
    logger.error({ error, limit }, 'Failed to add daily credit to user feature limit');
    return err(error instanceof Error ? error : new Error('Failed to add daily credit to user feature limit'));
  }
}

/**
 * Get or create a user's feature limit record
 * Uses a transaction to prevent race conditions where concurrent calls could create duplicates
 */
async function getOrCreateUserFeatureLimit(userId: number, feature: Feature): Promise<Result<UserFeatureLimit, Error>> {
  try {
    const defaults = FEATURE_LIMIT_DEFAULTS[feature]?.[PlanCodename.FREE];
    if (!defaults) {
      return err(new Error('No default limits configured for feature'));
    }

    // Use a transaction to atomically find-or-create and prevent race conditions
    const userFeatureLimit = await prisma.$transaction(async (tx) => {
      // Try to find an active feature limit for this user and feature
      const existingLimit = await tx.userFeatureLimit.findFirst({
        where: {
          userId,
          feature,
          isActive: true,
        },
      });

      // If found, return it
      if (existingLimit) {
        return existingLimit;
      }

      // Create one with defaults inside the transaction
      const newLimit = await tx.userFeatureLimit.create({
        data: {
          userId,
          feature: defaults.feature,
          planCodename: defaults.planCodename,
          period: defaults.period,
          useLimit: defaults.useLimit,
          isActive: true,
        },
      });

      logger.info(
        { userId, feature, defaults: defaults.planCodename },
        'Created new user feature limit with default settings',
      );

      return newLimit;
    });

    return ok(userFeatureLimit);
  } catch (error) {
    // Handle potential race condition: if transaction failed due to a concurrent create,
    // try to fetch the existing record that was created by the other call
    if (error instanceof Error && error.message.includes('Transaction failed')) {
      try {
        const existingLimit = await prisma.userFeatureLimit.findFirst({
          where: {
            userId,
            feature,
            isActive: true,
          },
        });
        if (existingLimit) {
          logger.debug({ userId, feature }, 'Retrieved feature limit after concurrent creation');
          return ok(existingLimit);
        }
      } catch (retryError) {
        logger.error(
          { error: retryError, userId, feature },
          'Failed to retrieve feature limit after transaction failure',
        );
      }
    }

    logger.error({ error, userId, feature }, 'Failed to get or create user feature limit');
    return err(error instanceof Error ? error : new Error('Failed to get or create user feature limit'));
  }
}

/**
 * Check if the current period has expired and reset it if needed
 * Maintains the original billing cycle (e.g., if billing started on 5th, keep it on 5th)
 */
async function checkAndResetPeriodIfNeeded(limit: UserFeatureLimit): Promise<UserFeatureLimit> {
  // if feature is research assistant, there'll be no period reset, so return the limit as is
  if (limit.feature === Feature.RESEARCH_ASSISTANT) {
    return limit;
  }

  const now = new Date();
  const periodStart = new Date(limit.currentPeriodStart);

  // Calculate the next period boundary based on the original start date
  const nextPeriodStart = calculateNextPeriodStart(periodStart, limit.period, now);

  if (nextPeriodStart && nextPeriodStart.getTime() !== periodStart.getTime()) {
    // Update to the next period boundary
    const updatedLimit = await prisma.userFeatureLimit.update({
      where: { id: limit.id },
      data: { currentPeriodStart: nextPeriodStart },
    });

    logger.info(
      {
        userId: limit.userId,
        feature: limit.feature,
        period: limit.period,
        oldPeriodStart: periodStart,
        newPeriodStart: nextPeriodStart,
      },
      'Reset feature limit period to next boundary',
    );

    return updatedLimit;
  }

  return limit;
}

/**
 * Calculate the next period start date that maintains the original billing cycle
 * Uses date-fns for robust date arithmetic
 */
function calculateNextPeriodStart(originalStart: Date, period: Period, now: Date): Date | null {
  let currentPeriodStart = new Date(originalStart);

  // Keep advancing the period until we reach the current time
  while (!isAfter(currentPeriodStart, now)) {
    let nextStart: Date;

    switch (period) {
      case Period.DAY:
        nextStart = addDays(currentPeriodStart, 1);
        break;
      case Period.WEEK:
        nextStart = addWeeks(currentPeriodStart, 1);
        break;
      case Period.MONTH:
        nextStart = addMonths(currentPeriodStart, 1);
        break;
      case Period.YEAR:
        nextStart = addYears(currentPeriodStart, 1);
        break;
      default:
        return null;
    }

    // If we've advanced past now, this is our next period start
    if (isAfter(nextStart, now)) {
      return currentPeriodStart;
    }

    currentPeriodStart = nextStart;
  }

  return currentPeriodStart;
}

/**
 * Update user's feature limits directly
 */
async function updateFeatureLimits({
  userId,
  feature,
  planCodename,
  period,
  useLimit,
  currentPeriodStart,
}: {
  userId: number;
  feature: Feature;
  planCodename?: PlanCodename;
  period?: Period;
  useLimit?: number | null;
  currentPeriodStart?: Date;
}): Promise<Result<void, Error>> {
  try {
    await prisma.$transaction(async (tx) => {
      // Get existing active limit to use as defaults
      const existingLimit = await tx.userFeatureLimit.findFirst({
        where: {
          userId,
          feature,
          isActive: true,
        },
      });

      // If no existing limit, we need all required fields
      if (!existingLimit && (!planCodename || !period)) {
        throw new Error('planCodename and period are required when creating new feature limit');
      }

      // Deactivate existing limits for this feature
      await tx.userFeatureLimit.updateMany({
        where: {
          userId,
          feature,
          isActive: true,
        },
        data: {
          isActive: false,
          updatedAt: new Date(),
        },
      });

      // Create new feature limit using old values as defaults, new values as overrides
      await tx.userFeatureLimit.create({
        data: {
          userId,
          feature,
          planCodename: planCodename ?? existingLimit?.planCodename,
          period: period ?? existingLimit?.period,
          useLimit: useLimit !== undefined ? useLimit : existingLimit?.useLimit,
          currentPeriodStart: currentPeriodStart ?? existingLimit?.currentPeriodStart ?? new Date(),
          isActive: true,
        },
      });
    });

    logger.info({ userId, feature, planCodename, period, useLimit, currentPeriodStart }, 'Updated user feature limits');

    return ok(undefined);
  } catch (error) {
    logger.error({ error, userId, feature }, 'Failed to update feature limits');
    return err(error instanceof Error ? error : new Error('Failed to update feature limits'));
  }
}

export const FeatureLimitsService = {
  checkFeatureLimit,
  getOrCreateUserFeatureLimit,
  updateFeatureLimits,
};
