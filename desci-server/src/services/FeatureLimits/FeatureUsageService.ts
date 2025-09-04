import { ExternalApi, Feature } from '@prisma/client';
import { ok, err, Result } from 'neverthrow';

import { prisma } from '../../client.js';
import { logger as parentLogger } from '../../logger.js';

import { FeatureLimitsService } from './FeatureLimitsService.js';

const logger = parentLogger.child({ module: 'FeatureUsageService' });

export class LimitExceededError extends Error {
  constructor(
    public readonly currentUsage: number,
    public readonly useLimit: number,
  ) {
    super(`Feature limit exceeded: ${currentUsage}/${useLimit}`);
    this.name = 'LimitExceededError';
  }
}

export interface ConsumeUsageRequest {
  userId: number;
  feature: Feature;
  data?: unknown;
}

export interface ConsumeUsageResponse {
  usageId: number;
}

async function consumeUsage(request: ConsumeUsageRequest): Promise<Result<ConsumeUsageResponse, Error>> {
  try {
    const { userId, feature, data } = request;

    // Only support Research Assistant atm
    if (feature !== Feature.RESEARCH_ASSISTANT) {
      return err(new Error('Unsupported feature for this endpoint'));
    }

    // Ensure period rollover if needed
    const precheck = await FeatureLimitsService.checkFeatureLimit(userId, feature);
    if (precheck.isErr()) return err(precheck.error);

    const result = await prisma.$transaction(async (tx) => {
      // Ensure there is an active limit
      const activeLimit = await tx.userFeatureLimit.findFirst({
        where: { userId, feature, isActive: true },
      });
      if (!activeLimit) {
        throw new Error('Active feature limit not found');
      }

      // Compute current usage since the period start (Research Assistant only)
      const currentUsage = await tx.externalApiUsage.count({
        where: {
          userId,
          apiType: ExternalApi.RESEARCH_ASSISTANT,
          createdAt: { gte: activeLimit.currentPeriodStart },
        },
      });

      const useLimit = activeLimit.useLimit;
      if (useLimit !== null && currentUsage + 1 > useLimit) {
        return { type: 'limit', currentUsage, useLimit } as const;
      }

      const created = await tx.externalApiUsage.create({
        data: {
          userId,
          apiType: ExternalApi.RESEARCH_ASSISTANT,
          data: data as any,
        },
      });

      return { type: 'created', usageId: created.id } as const;
    });

    if (result.type === 'limit') {
      return err(new LimitExceededError(result.currentUsage, result.useLimit));
    }

    return ok({ usageId: result.usageId });
  } catch (error) {
    logger.error({ error, request }, 'Failed to consume feature usage');
    return err(error instanceof Error ? error : new Error('Failed to consume feature usage'));
  }
}

export interface RefundUsageRequest {
  userId: number;
  feature: Feature;
  usageId: number;
}

async function refundUsage(request: RefundUsageRequest): Promise<Result<void, Error>> {
  try {
    const { userId, feature, usageId } = request;
    if (feature !== Feature.RESEARCH_ASSISTANT) {
      return err(new Error('Unsupported feature for this endpoint'));
    }
    const apiType = ExternalApi.RESEARCH_ASSISTANT;

    const deleted = await prisma.externalApiUsage.deleteMany({
      where: { id: usageId, userId, apiType },
    });

    if (deleted.count === 0) {
      return err(new Error('Usage entry not found for user/feature'));
    }

    logger.info({ userId, feature, usageId }, 'Refunded feature usage');
    return ok(undefined);
  } catch (error) {
    logger.error({ error, request }, 'Failed to refund feature usage');
    return err(error instanceof Error ? error : new Error('Failed to refund feature usage'));
  }
}

export const FeatureUsageService = {
  consumeUsage,
  refundUsage,
  LimitExceededError,
};
