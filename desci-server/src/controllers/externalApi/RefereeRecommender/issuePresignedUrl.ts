import { Response } from 'express';
import { z } from 'zod';

import { sendSuccess, sendError } from '../../../core/api.js';
import { AuthenticatedRequest } from '../../../core/types.js';
import { logger as parentLogger } from '../../../logger.js';
import { RefereeRecommenderService } from '../../../services/externalApi/RefereeRecommenderService.js';
import { prisma } from '../../../client.js';
import { ExternalApi } from '@prisma/client';

const logger = parentLogger.child({ module: 'RefereeRecommender::PresignedUrlController' });

const generatePresignedUrlSchema = z.object({
  body: z.object({
    fileHash: z.string().min(1, 'fileHash is required'),
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
    const { fileHash, fileName } = body;

    logger.info(
      {
        userId: user.id,
        fileHash,
        fileName,
      },
      'Checking cache and potentially generating presigned URL for referee recommender',
    );

    // First, check if we have cached results for this fileHash
    const cachedResult = await prisma.externalApiUsage.findFirst({
      where: {
        userId: user.id,
        apiType: ExternalApi.REFEREE_FINDER,
        queryingData: {
          path: ['fileHash'],
          equals: fileHash,
        },
      },
      orderBy: {
        createdAt: 'desc', // Get the most recent result
      },
    });

    if (cachedResult) {
      logger.info(
        {
          userId: user.id,
          fileHash,
          cachedResultId: cachedResult.id,
        },
        'Found cached results for fileHash',
      );

      return sendSuccess(res, {
        cached: true,
        message: 'Results for this file are already available',
        resultId: cachedResult.id,
        createdAt: cachedResult.createdAt,
      });
    }

    // No cached results found, proceed with generating presigned URL
    // Validate file extension
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
      cached: false,
      presignedUrl,
      fileName: generatedFileName,
      fileHash,
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
