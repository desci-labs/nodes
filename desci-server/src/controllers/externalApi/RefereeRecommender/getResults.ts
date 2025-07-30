import { Response } from 'express';
import { z } from 'zod';

import { sendSuccess, sendError } from '../../../core/api.js';
import { AuthenticatedRequest } from '../../../core/types.js';
import { logger as parentLogger } from '../../../logger.js';
import { RefereeRecommenderService } from '../../../services/externalApi/RefereeRecommenderService.js';
import { getRefereeResultsSchema } from '../../../schemas/externalApi.schema.js';

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

    // Verify user has access to this filename by checking session
    const sessionResult = await RefereeRecommenderService.getSession(UploadedFileName);
    if (sessionResult.isErr()) {
      logger.warn(
        {
          userId: user.id,
          uploadedFileName: UploadedFileName,
        },
        'Session not found or expired',
      );
      return sendError(res, 'Results not found or access denied', 404);
    }

    const session = sessionResult.value;
    if (session.userId !== user.id) {
      logger.warn(
        {
          userId: user.id,
          sessionUserId: session.userId,
          uploadedFileName: UploadedFileName,
        },
        'User does not have access to this session',
      );
      return sendError(res, 'Results not found or access denied', 404);
    }

    const result = await RefereeRecommenderService.getRefereeResults(UploadedFileName);

    if (result.isErr()) {
      logger.error(
        {
          error: result.error,
          userId: user.id,
          uploadedFileName: UploadedFileName,
        },
        'Failed to fetch referee results',
      );
      return sendError(res, result.error.message, 500);
    }

    const responseData = result.value;

    logger.info(
      {
        userId: user.id,
        uploadedFileName: UploadedFileName,
        status: responseData.status,
      },
      'Successfully fetched referee recommendation results',
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
