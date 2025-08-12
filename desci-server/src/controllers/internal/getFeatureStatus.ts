import { Feature } from '@prisma/client';
import { RequestHandler } from 'express';

import { sendError, sendSuccess } from '../../core/api.js';
import { logger as parentLogger } from '../../logger.js';
import { FeatureLimitsService } from '../../services/FeatureLimits/FeatureLimitsService.js';

const logger = parentLogger.child({ module: 'InternalGetFeatureStatus' });

export const getFeatureStatus: RequestHandler = async (req, res) => {
  try {
    const userId = Number(req.query.userId);
    const feature = String(req.query.feature) as Feature;

    if (!userId || !feature) {
      return sendError(res, 'Missing userId or feature', 400);
    }

    const statusResult = await FeatureLimitsService.checkFeatureLimit(userId, feature);
    if (statusResult.isErr()) {
      return sendError(res, statusResult.error.message, 500);
    }

    return sendSuccess(res, statusResult.value);
  } catch (error) {
    logger.error({ error }, 'Failed to get feature status');
    return sendError(res, 'Failed to get feature status', 500);
  }
};
