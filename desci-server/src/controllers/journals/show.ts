import { Response } from 'express';
import { z } from 'zod';

import { sendError, sendSuccess } from '../../core/api.js';
import { AuthenticatedRequest } from '../../core/types.js';
import { logger as parentLogger } from '../../logger.js';
import { JournalManagementService } from '../../services/journals/JournalManagementService.js';

const logger = parentLogger.child({
  module: 'Journals::ShowJournalController',
});

const GetJournalParamsSchema = z.object({
  journalId: z.string().transform((val, ctx) => {
    const id = parseInt(val, 10);
    if (isNaN(id) || id <= 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Journal ID must be a positive integer.',
      });
      return z.NEVER;
    }
    return id;
  }),
});

interface GetJournalRequest extends AuthenticatedRequest<z.input<typeof GetJournalParamsSchema>, any, any, any> {}

export const showJournalController = async (req: GetJournalRequest, res: Response) => {
  try {
    const parsedParams = GetJournalParamsSchema.safeParse(req.params);

    if (!parsedParams.success) {
      logger.warn({ error: parsedParams.error.flatten(), params: req.params }, 'Invalid journal ID format');
      const formattedErrors = Object.entries(parsedParams.error.flatten().fieldErrors).flatMap(([field, messages]) =>
        (messages || []).map((message) => ({ field, message })),
      );
      return sendError(res, 'Invalid journal ID provided.', formattedErrors, 400);
    }

    const { journalId } = parsedParams.data;

    logger.info({ journalId }, 'Attempting to retrieve journal by ID');

    const result = await JournalManagementService.getJournalById(journalId);

    if (result.isErr()) {
      const error = result.error;

      if (error.message === 'Journal not found.') {
        logger.warn({ journalId, error: error.message }, 'Journal not found by ID.');
        return sendError(res, 'Journal not found.', undefined, 404);
      }

      logger.error({ error, journalId }, 'Failed to retrieve journal by ID.');
      return sendError(res, 'Failed to retrieve journal due to a server error.', undefined, 500);
    }

    const journalDetails = result.value;
    return sendSuccess(res, { journal: journalDetails }, 'Journal retrieved successfully.');
  } catch (error) {
    logger.error({ error, params: req.params, userId: req.user?.id }, 'Unhandled error in showJournalController');
    return sendError(res, 'An unexpected error occurred.', undefined, 500);
  }
};
