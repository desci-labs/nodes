import { Feature } from '@prisma/client';
import { RequestHandler } from 'express';

import { sendError, sendSuccess } from '../../core/api.js';
import { logger as parentLogger } from '../../logger.js';
import { FeatureUsageService, LimitExceededError } from '../../services/FeatureLimits/FeatureUsageService.js';

const logger = parentLogger.child({ module: 'InternalPostFeatureUsage' });

type PostFeatureUsageBody = {
  userId: number;
  feature: Feature;
  direction: 'increment' | 'decrement';
  usageId?: number; // required for decrement
  data?: unknown;
};

export const postFeatureUsage: RequestHandler = async (req, res) => {
  try {
    const { userId, feature, direction, usageId, data } = req.body as PostFeatureUsageBody;

    if (!userId || !feature || !direction) {
      return sendError(res, 'Missing userId, feature or direction', 400);
    }

    if (direction === 'decrement') {
      if (!usageId) {
        return sendError(res, 'usageId is required for decrement', 400);
      }
      const refund = await FeatureUsageService.refundUsage({ userId, feature, usageId });
      if (refund.isErr()) {
        const msg = refund.error.message || 'Failed to refund feature usage';
        const status = msg.includes('not found') ? 404 : 500;
        return sendError(res, msg, status);
      }
      return sendSuccess(res, { refunded: true, usageId });
    }

    const consumed = await FeatureUsageService.consumeUsage({ userId, feature, data });
    if (consumed.isErr()) {
      if (consumed.error instanceof LimitExceededError) {
        return sendError(res, consumed.error.message, 409);
      }
      return sendError(res, consumed.error.message, 500);
    }

    return sendSuccess(res, { usageId: consumed.value.usageId });
  } catch (error) {
    logger.error({ error, body: req.body }, 'Failed to update feature usage');
    return sendError(res, 'Failed to update feature usage', 500);
  }
};
