import { Feature } from '@prisma/client';
import { Response } from 'express';

import { sendError, sendSuccess } from '../../../core/api.js';
import { AuthenticatedRequest } from '../../../core/types.js';
import { logger as parentLogger } from '../../../logger.js';
import { FeatureLimitsService } from '../../../services/FeatureLimits/FeatureLimitsService.js';
// import { getUserUsageData } from '../../../services/subscription.js';

const logger = parentLogger.child({ module: 'ResearchAssistant::UsageStatusController' });

export const getResearchAssistantUsageStatus = async (req: AuthenticatedRequest, res: Response) => {
  // try {
  //   const user = req.user;
  //   if (!user) {
  //     return sendError(res, 'User authentication required', 401);
  //   }

  //   const usageData = await getUserUsageData(user.id);
  //   if (!usageData) {
  //     logger.error({ userId: user.id }, 'Usage data not found');
  //     return sendError(res, 'Usage data not found', 404);
  //   }

  //   const responseData = {
  //     totalLimit: usageData.totalLimit,
  //     totalUsed: usageData.totalUsed,
  //     totalRemaining: usageData.totalRemaining,
  //     planCodename: usageData.planCodename,
  //     isWithinLimit: usageData.isWithinLimit,
  //     trialStart: usageData.trialStart,
  //     trialEnd: usageData.trialEnd,
  //     isTrialActive: usageData.isTrialActive,
  //     isTrialExpired: usageData.isTrialExpired,
  //     initialTrialCredits: usageData.initialTrialCredits,
  //     nextCreditRefreshTime: usageData.nextCreditRefreshTime,
  //   };

  //   logger.info({ userId: user.id, ...responseData }, 'Successfully fetched research assistant usage status');
  //   return sendSuccess(res, responseData);
  // } catch (error) {
  //   logger.error({ error }, 'Failed to fetch research assistant usage status');
  //   return sendError(res, 'Internal server error', 500);
  // }

  try {
    const user = req.user;
    if (!user) {
      return sendError(res, 'User authentication required', 401);
    }

    logger.info({ userId: user.id }, 'Fetching research assistant usage status');

    const limitResult = await FeatureLimitsService.checkFeatureLimit(user.id, Feature.RESEARCH_ASSISTANT);
    if (limitResult.isErr()) {
      logger.error({ error: limitResult.error, userId: user.id }, 'Failed to check feature limit status');
      return sendError(res, 'Failed to retrieve usage status', 500);
    }

    const status = limitResult.value;
    const responseData = {
      totalLimit: status.useLimit,
      totalUsed: status.currentUsage,
      totalRemaining: status.remainingUses,
      planCodename: status.planCodename,
      isWithinLimit: status.isWithinLimit,
    };

    logger.info({ userId: user.id, ...responseData }, 'Successfully fetched research assistant usage status');

    return sendSuccess(res, responseData);
  } catch (error) {
    logger.error({ error }, 'Failed to fetch research assistant usage status');
    return sendError(res, 'Internal server error', 500);
  }
};
