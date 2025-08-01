import { Response } from 'express';
import { z } from 'zod';

import { sendSuccess, sendError } from '../../../core/api.js';
import { AuthenticatedRequest } from '../../../core/types.js';
import { logger as parentLogger } from '../../../logger.js';
import { triggerRefereeRecommendationSchema } from '../../../schemas/externalApi.schema.js';
import { RefereeRecommenderService } from '../../../services/externalApi/RefereeRecommenderService.js';

const logger = parentLogger.child({ module: 'RefereeRecommender::TriggerController' });

type TriggerRecommendationRequest = z.infer<typeof triggerRefereeRecommendationSchema> & AuthenticatedRequest;

export const triggerRecommendation = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = req.user;
    if (!user) {
      return sendError(res, 'User authentication required', 401);
    }

    const { body } = triggerRefereeRecommendationSchema.parse(req);

    // Check rate limit: 10 requests per 24 hours (3600 * 24 seconds)
    const rateLimitCheck = await RefereeRecommenderService.checkRateLimit(
      user.id,
      RefereeRecommenderService.RATE_LIMIT_USES,
      RefereeRecommenderService.RATE_LIMIT_TIMEFRAME_SECONDS,
    );
    if (rateLimitCheck.isErr()) {
      logger.warn(
        {
          userId: user.id,
          error: rateLimitCheck.error.message,
        },
        'Rate limit exceeded for referee recommendation',
      );
      return sendError(res, rateLimitCheck.error.message, 429);
    }

    logger.info(
      {
        userId: user.id,
        cid: body.cid,
        external: body.external,
      },
      'Triggering referee recommendation',
    );

    const result = await RefereeRecommenderService.triggerRefereeRecommendation(
      body as typeof body & { cid: string },
      user.id,
    );

    if (result.isErr()) {
      logger.error(
        {
          error: result.error,
          userId: user.id,
          cid: body.cid,
        },
        'Failed to trigger referee recommendation',
      );

      // If the request failed, we don't have a filename to clean up
      // The session was never stored, so no cleanup needed
      return sendError(res, result.error.message, 500);
    }

    const responseData = result.value;

    logger.info(
      {
        userId: user.id,
        uploadedFileName: responseData.uploaded_file_name,
        info: responseData.info,
      },
      'Successfully triggered referee recommendation',
    );

    return sendSuccess(res, responseData);
  } catch (error) {
    if (error instanceof z.ZodError) {
      logger.warn({ error: error.errors }, 'Invalid request parameters');
      return sendError(res, 'Invalid request parameters', 400);
    }

    logger.error({ error }, 'Failed to trigger referee recommendation');
    return sendError(res, 'Internal server error', 500);
  }
};
