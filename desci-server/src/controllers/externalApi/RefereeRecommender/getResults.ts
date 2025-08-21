import { ExternalApi } from '@prisma/client';
import { Response } from 'express';
import { z } from 'zod';

import { prisma } from '../../../client.js';
import { sendSuccess, sendError } from '../../../core/api.js';
import { AuthenticatedRequest } from '../../../core/types.js';
import { logger as parentLogger } from '../../../logger.js';
import { getRefereeResultsSchema } from '../../../schemas/externalApi.schema.js';
import { RefereeRecommenderService } from '../../../services/externalApi/RefereeRecommenderService.js';

const logger = parentLogger.child({ module: 'RefereeRecommender::GetResultsController' });

type GetResultsRequest = z.infer<typeof getRefereeResultsSchema> & AuthenticatedRequest;

export const getResults = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = req.user;
    if (!user) {
      return sendError(res, 'User authentication required', 401);
    }

    const { query } = getRefereeResultsSchema.parse(req);
    const { UploadedFileName } = query;

    logger.info(
      {
        userId: user.id,
        uploadedFileName: UploadedFileName,
      },
      'Fetching referee recommendation results',
    );

    // Check ExternalApiUsage table for completed results
    const existingResult = await prisma.externalApiUsage.findFirst({
      where: {
        userId: user.id,
        apiType: ExternalApi.REFEREE_FINDER,
        queryingData: {
          path: ['fileName'],
          equals: UploadedFileName,
        },
      },
      orderBy: {
        createdAt: 'desc', // Get the most recent result
      },
    });

    if (!existingResult) {
      logger.warn(
        {
          userId: user.id,
          uploadedFileName: UploadedFileName,
        },
        'No results found for this filename and user',
      );
      return sendError(res, 'Results not found', 404);
    }

    // User has access to this filename, now fetch actual results from lambda API
    const result = await RefereeRecommenderService.getRefereeResults(UploadedFileName);

    if (result.isErr()) {
      logger.error(
        {
          error: result.error,
          userId: user.id,
          uploadedFileName: UploadedFileName,
          resultId: existingResult.id,
        },
        'Failed to fetch referee results from lambda API',
      );
      return sendError(res, result.error.message, 500);
    }

    const responseData = result.value;

    logger.info(
      {
        userId: user.id,
        uploadedFileName: UploadedFileName,
        resultId: existingResult.id,
        createdAt: existingResult.createdAt,
      },
      'Successfully fetched referee recommendation results from database',
    );

    return sendSuccess(res, responseData);
  } catch (error) {
    if (error instanceof z.ZodError) {
      logger.warn({ error: error.errors }, 'Invalid request parameters');
      return sendError(res, 'Invalid request parameters', 400);
    }

    logger.error({ error }, 'Failed to fetch referee results');
    return sendError(res, 'Internal server error', 500);
  }
};
