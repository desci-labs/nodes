import { Feature } from '@prisma/client';
import { Response } from 'express';

import { sendSuccess, sendError } from '../../../core/api.js';
import { AuthenticatedRequest } from '../../../core/types.js';
import { logger as parentLogger } from '../../../logger.js';
import { FeatureLimitsService } from '../../../services/FeatureLimits/FeatureLimitsService.js';

const logger = parentLogger.child({ module: 'RefereeRecommender::UsageStatusController' });

export const getUsageStatus = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = req.user;
    if (!user) {
      return sendError(res, 'User authentication required', 401);
    }

    logger.info(
      {
        userId: user.id,
      },
      'Fetching referee recommender usage status',
    );

    // Check feature limit status
    const limitResult = await FeatureLimitsService.checkFeatureLimit(user.id, Feature.REFEREE_FINDER);
    if (limitResult.isErr()) {
      logger.error(
        {
          error: limitResult.error,
          userId: user.id,
        },
        'Failed to check feature limit status',
      );
      return sendError(res, 'Failed to retrieve usage status', 500);
    }

    const limitStatus = limitResult.value;

    const responseData = {
      totalLimit: limitStatus.useLimit,
      totalUsed: limitStatus.currentUsage,
      totalRemaining: limitStatus.remainingUses,
      planCodename: limitStatus.planCodename,
      isWithinLimit: limitStatus.isWithinLimit,
    };

    logger.info(
      {
        userId: user.id,
        ...responseData,
      },
      'Successfully fetched usage status',
    );

    return sendSuccess(res, responseData);
  } catch (error) {
    logger.error({ error }, 'Failed to fetch usage status');
    return sendError(res, 'Internal server error', 500);
  }
};
