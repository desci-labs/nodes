import { Response } from 'express';

import { sendSuccess, sendError } from '../../../core/api.js';
import { AuthenticatedRequest } from '../../../core/types.js';
import { logger as parentLogger } from '../../../logger.js';
import { RefereeRecommenderService } from '../../../services/externalApi/RefereeRecommenderService.js';

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

    // Get current usage count
    const totalUsed = await RefereeRecommenderService.getUserUsageCount(
      user.id,
      RefereeRecommenderService.RATE_LIMIT_TIMEFRAME_SECONDS,
    );

    const totalLimit = RefereeRecommenderService.RATE_LIMIT_USES;
    const totalRemaining = Math.max(0, totalLimit - totalUsed);

    const responseData = {
      totalLimit,
      totalUsed,
      totalRemaining,
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
