import { Response } from 'express';
import { z } from 'zod';

import { prisma } from '../../../client.js';
import { sendSuccess, sendError } from '../../../core/api.js';
import { AuthenticatedRequest } from '../../../core/types.js';
import { logger as parentLogger } from '../../../logger.js';

const logger = parentLogger.child({ module: 'RefereeRecommender::ListRunsController' });

const listRunsQuerySchema = z.object({
  query: z.object({
    limit: z.coerce.number().int().min(1).max(100).optional().default(20),
    cursor: z.coerce.number().int().optional(),
  }),
});

/**
 * GET /v1/services/ai/referee-recommender/runs
 * Returns the user's persisted referee-recommender runs, newest first.
 * Lightweight rows — full result blob is NOT included; clients fetch the
 * report via /results?UploadedFileName=... when the user opens one.
 */
export const listRuns = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = req.user;
    if (!user) {
      return sendError(res, 'User authentication required', 401);
    }

    const { query } = listRunsQuerySchema.parse(req);
    const { limit, cursor } = query;

    const runs = await prisma.refereeRecommenderRun.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: {
        id: true,
        uploadedFileName: true,
        originalFileName: true,
        status: true,
        paperTitle: true,
        paperPubYear: true,
        contextNovelty: true,
        contentNovelty: true,
        reviewerCount: true,
        errorMessage: true,
        createdAt: true,
        completedAt: true,
      },
    });

    const hasMore = runs.length > limit;
    const items = hasMore ? runs.slice(0, limit) : runs;
    const nextCursor = hasMore ? items[items.length - 1].id : null;

    logger.debug(
      { userId: user.id, count: items.length, hasMore },
      'Listed referee recommender runs',
    );

    return sendSuccess(res, { items, nextCursor });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return sendError(res, 'Invalid request parameters', 400);
    }
    logger.error({ error }, 'Failed to list referee recommender runs');
    return sendError(res, 'Internal server error', 500);
  }
};
