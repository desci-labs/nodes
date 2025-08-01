import { Response } from 'express';
import { z } from 'zod';

import { sendSuccess, sendError } from '../../../core/api.js';
import { AuthenticatedRequest } from '../../../core/types.js';
import { logger as parentLogger } from '../../../logger.js';
import { RefereeRecommenderService } from '../../../services/externalApi/RefereeRecommenderService.js';

const logger = parentLogger.child({ module: 'RefereeRecommender::PresignedUrlController' });

const generatePresignedUrlSchema = z.object({
  body: z.object({
    fileName: z.string().min(1, 'fileName is required'),
  }),
});

type GeneratePresignedUrlRequest = z.infer<typeof generatePresignedUrlSchema> & AuthenticatedRequest;

export const generatePresignedUrl = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = req.user;
    if (!user) {
      return sendError(res, 'User authentication required', 401);
    }

    const { body } = generatePresignedUrlSchema.parse(req);
    const { fileName } = body;

    logger.info(
      {
        userId: user.id,
        fileName,
      },
      'Generating presigned URL for referee recommender',
    );

    // Check rate limit before processing
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
        'Rate limit exceeded for presigned URL generation',
      );
      return sendError(res, rateLimitCheck.error.message, 429);
    }

    // Validate file extension (assuming PDFs for now)
    if (!fileName.toLowerCase().endsWith('.pdf')) {
      return sendError(res, 'Only PDF files are supported', 400);
    }

    const result = await RefereeRecommenderService.generatePresignedUploadUrl({
      userId: user.id,
      originalFileName: fileName,
    });

    if (result.isErr()) {
      logger.error({ error: result.error, userId: user.id, fileName }, 'Failed to generate presigned URL');
      return sendError(res, 'Failed to generate presigned URL', 500);
    }

    const { presignedUrl, fileName: generatedFileName } = result.value;

    logger.info(
      {
        userId: user.id,
        fileName: generatedFileName,
      },
      'Successfully generated presigned URL',
    );

    return sendSuccess(res, {
      presignedUrl,
      fileName: generatedFileName,
      expiresIn: 3600, // 1 hour
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      logger.warn({ error: error.errors }, 'Invalid request parameters');
      return sendError(res, 'Invalid request parameters', 400);
    }

    logger.error({ error }, 'Failed to generate presigned URL');
    return sendError(res, 'Internal server error', 500);
  }
};
