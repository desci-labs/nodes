import { ExternalApi } from '@prisma/client';
import { Response } from 'express';
import _ from 'lodash';
import { z } from 'zod';

import { prisma } from '../../../client.js';
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
    const { fileUrl, fileHash } = body;

    logger.info(
      {
        userId: user.id,
        fileUrl,
        fileHash,
      },
      'Checking cache and potentially triggering referee recommendation',
    );

    // Check if we have cached results for this fileHash (if provided)
    let cachedResult = null;

    if (fileHash) {
      cachedResult = await prisma.externalApiUsage.findFirst({
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
          'Found cached results for fileHash, returning cached data',
        );

        return sendSuccess(res, {
          cached: true,
          message: 'Results for this file are already available',
          createdAt: cachedResult.createdAt,
          resultKey: RefereeRecommenderService.prepareFormattedFileName(fileHash),
        });
      }
    }

    const result = await RefereeRecommenderService.triggerRefereeRecommendation(
      {
        // hash_value,
        // hash_verified,
        file_url: body.fileUrl,
        top_n_closely_matching: body.top_n_closely_matching,
        number_referees: body.number_referees,
        force_run: body.force_run,
        classify: body.classify,
        coi_filter: body.coi_filter,
        meta_data_only: body.meta_data_only,
        exclude_fields: body.exclude_fields,
        exclude_works: body.exclude_works,
        exclude_authors: body.exclude_authors,
      },
      user.id,
    );

    if (result.isErr()) {
      logger.error(
        {
          error: result.error,
          userId: user.id,
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
        uploadedFileName: responseData.UploadedFileName,
        info: responseData.info,
      },
      'Successfully triggered referee recommendation',
    );

    const formattedResponse = _.omit(responseData, 'execution_arn');

    // Check if results are already available based on info message
    const isResultReady =
      responseData.info?.toLowerCase().includes('already exists') &&
      responseData.info?.toLowerCase().includes('ready to be polled');

    return sendSuccess(res, {
      ...formattedResponse,
      cached: isResultReady,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      logger.warn({ error: error.errors }, 'Invalid request parameters');
      return sendError(res, 'Invalid request parameters', 400);
    }

    logger.error({ error }, 'Failed to trigger referee recommendation');
    return sendError(res, 'Internal server error', 500);
  }
};
