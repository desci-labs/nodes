import { Feature, ExternalApi } from '@prisma/client';
import { Response } from 'express';
import { z } from 'zod';

import { prisma } from '../../../client.js';
import { sendError, sendSuccess } from '../../../core/api.js';
import { AuthenticatedRequest } from '../../../core/types.js';
import { logger as parentLogger } from '../../../logger.js';
import { FeatureLimitsService } from '../../../services/FeatureLimits/FeatureLimitsService.js';

const logger = parentLogger.child({ module: 'ResearchAssistant::OnboardUsageController' });

const onboardUsageSchema = z.object({
  guestUsageCount: z.number().int().min(0).max(100),
});

export const onboardResearchAssistantUsage = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = req.user;
    if (!user) {
      return sendError(res, 'User authentication required', 401);
    }

    // Validate request body
    const parseResult = onboardUsageSchema.safeParse(req.body);
    if (!parseResult.success) {
      logger.warn({ userId: user.id, errors: parseResult.error.errors }, 'Invalid request parameters');
      return sendError(res, 'Invalid parameters. guestUsageCount must be between 0 and 4', 400);
    }

    const { guestUsageCount } = parseResult.data;

    logger.info({ userId: user.id, guestUsageCount }, 'Starting research assistant usage onboarding');

    // Get or create user feature limit to ensure billing period exists
    const limitResult = await FeatureLimitsService.checkFeatureLimit(user.id, Feature.RESEARCH_ASSISTANT);
    if (limitResult.isErr()) {
      logger.error({ error: limitResult.error, userId: user.id }, 'Failed to check feature limit during onboarding');
      return sendError(res, 'Failed to initialize usage tracking', 500);
    }

    // If no usage to onboard, return early
    if (guestUsageCount === 0) {
      logger.info({ userId: user.id }, 'No guest usage to onboard');
      return sendSuccess(res, { message: 'No usage to onboard', createdEntries: 0 });
    }

    // Create usage entries for the guest usage
    const usageEntries = Array.from({ length: guestUsageCount }, () => ({
      userId: user.id,
      apiType: ExternalApi.RESEARCH_ASSISTANT,
      data: {
        onboardingEntry: true,
      },
    }));

    // Insert all usage entries
    const createdUsage = await prisma.externalApiUsage.createMany({
      data: usageEntries,
    });

    logger.info(
      {
        userId: user.id,
        guestUsageCount,
        createdEntries: createdUsage.count,
      },
      'Successfully onboarded guest research assistant usage',
    );

    // Return updated status
    const updatedLimitResult = await FeatureLimitsService.checkFeatureLimit(user.id, Feature.RESEARCH_ASSISTANT);
    if (updatedLimitResult.isErr()) {
      logger.error(
        { error: updatedLimitResult.error, userId: user.id },
        'Failed to get updated status after onboarding',
      );
      return sendError(res, 'Onboarding completed but failed to get updated status', 500);
    }

    const status = updatedLimitResult.value;
    return sendSuccess(res, {
      message: 'Success',
      currentStatus: {
        totalLimit: status.useLimit,
        totalUsed: status.currentUsage,
        totalRemaining: status.remainingUses,
        isWithinLimit: status.isWithinLimit,
      },
    });
  } catch (error) {
    logger.error({ error, userId: req.user?.id }, 'Failed to onboard research assistant usage');
    return sendError(res, 'Internal server error', 500);
  }
};
