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
      { userId: user.id, uploadedFileName: UploadedFileName },
      'Fetching referee recommendation results',
    );

    // Cache: if we already persisted this run for this user, return it.
    // This is the long-term store — Redis sessions expire after 24h, so any
    // run older than that is only reachable via the DB.
    const persisted = await prisma.refereeRecommenderRun.findUnique({
      where: {
        userId_uploadedFileName: {
          userId: user.id,
          uploadedFileName: UploadedFileName,
        },
      },
    });

    if (persisted && persisted.status === 'SUCCEEDED' && persisted.result) {
      return sendSuccess(res, {
        status: 'SUCCEEDED',
        UploadedFileName,
        result: persisted.result,
      });
    }
    if (persisted && persisted.status === 'FAILED') {
      return sendSuccess(res, {
        status: 'FAILED',
        UploadedFileName,
        result: null,
        error: persisted.errorMessage,
      });
    }

    // Authorize: persisted ownership OR live Redis session (run still active).
    if (!persisted) {
      const sessionResult = await RefereeRecommenderService.getSession(UploadedFileName, user.id);
      if (sessionResult.isErr() || sessionResult.value.userId !== user.id) {
        logger.warn(
          { userId: user.id, uploadedFileName: UploadedFileName },
          'No persisted run and no active session for this user',
        );
        return sendError(res, 'Results not found or access denied', 404);
      }
    }

    const result = await RefereeRecommenderService.getRefereeResults(UploadedFileName);
    if (result.isErr()) {
      logger.error(
        { error: result.error, userId: user.id, uploadedFileName: UploadedFileName },
        'Failed to fetch referee results',
      );
      return sendError(res, result.error.message, 500);
    }

    const responseData = result.value;

    // Write-through cache: on first SUCCEEDED fetch, persist so future calls
    // (including across SQS misses or 24h-expired sessions) hit the DB.
    if (responseData.status === 'SUCCEEDED') {
      const paperData = (responseData.result as any)?.data?.paper_data ?? {};
      const reviewers = (responseData.result as any)?.data?.reviewers;
      const reviewerCount = Array.isArray(reviewers)
        ? reviewers.length
        : reviewers && typeof reviewers === 'object'
          ? Object.keys(reviewers).length
          : null;
      try {
        await prisma.refereeRecommenderRun.upsert({
          where: {
            userId_uploadedFileName: { userId: user.id, uploadedFileName: UploadedFileName },
          },
          create: {
            userId: user.id,
            uploadedFileName: UploadedFileName,
            s3Key: UploadedFileName,
            status: 'SUCCEEDED',
            paperTitle: paperData.title ?? null,
            paperAbstract: paperData.abstract ?? null,
            paperPubYear: paperData.pub_year ?? null,
            contextNovelty: paperData.context_novelty ?? null,
            contentNovelty: paperData.content_novelty ?? null,
            reviewerCount,
            result: responseData.result ?? undefined,
            completedAt: new Date(),
          },
          update: {
            status: 'SUCCEEDED',
            paperTitle: paperData.title ?? null,
            paperAbstract: paperData.abstract ?? null,
            paperPubYear: paperData.pub_year ?? null,
            contextNovelty: paperData.context_novelty ?? null,
            contentNovelty: paperData.content_novelty ?? null,
            reviewerCount,
            result: responseData.result ?? undefined,
            completedAt: new Date(),
            errorMessage: null,
          },
        });
      } catch (err) {
        // Cache failure shouldn't block the response.
        logger.error(
          { err, userId: user.id, uploadedFileName: UploadedFileName },
          'Failed to write-through cache referee result',
        );
      }
    }

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
