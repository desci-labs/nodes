import { Response } from 'express';
import { z } from 'zod';

import { BadRequestError, InternalError } from '../../../core/ApiError.js';
import { SuccessResponse } from '../../../core/ApiResponse.js';
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
      throw new BadRequestError('User authentication required');
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

    // Validate file extension (assuming PDFs for now)
    if (!fileName.toLowerCase().endsWith('.pdf')) {
      throw new BadRequestError('Only PDF files are supported');
    }

    const result = await RefereeRecommenderService.generatePresignedUploadUrl({
      userId: user.id,
      originalFileName: fileName,
    });

    if (result.isErr()) {
      logger.error({ error: result.error, userId: user.id, fileName }, 'Failed to generate presigned URL');
      throw new InternalError('Failed to generate presigned URL');
    }

    const { presignedUrl, fileName: generatedFileName } = result.value;

    logger.info(
      {
        userId: user.id,
        fileName: generatedFileName,
      },
      'Successfully generated presigned URL',
    );

    return new SuccessResponse({
      presignedUrl,
      fileName: generatedFileName,
      expiresIn: 3600, // 1 hour
    }).send(res);
  } catch (error) {
    if (error instanceof z.ZodError) {
      logger.warn({ error: error.errors }, 'Invalid request parameters');
      throw new BadRequestError('Invalid request parameters');
    }

    logger.error({ error }, 'Failed to generate presigned URL');
    throw error;
  }
};
