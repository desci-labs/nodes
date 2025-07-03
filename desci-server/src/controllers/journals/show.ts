import { Response } from 'express';

import { sendError, sendSuccess } from '../../core/api.js';
import { ValidatedRequest, OptionalAuthenticatedRequest } from '../../core/types.js';
import { logger as parentLogger } from '../../logger.js';
import { getJournalSchema } from '../../schemas/journals.schema.js';
import { JournalManagementService } from '../../services/journals/JournalManagementService.js';
//
const logger = parentLogger.child({
  module: 'Journals::ShowJournalController',
});

type ShowJournalRequest = ValidatedRequest<typeof getJournalSchema, OptionalAuthenticatedRequest>;

export const showJournalController = async (req: ShowJournalRequest, res: Response) => {
  try {
    const { journalId } = req.validatedData.params;

    logger.info({ journalId, userId: req.user?.id }, 'Attempting to retrieve journal by ID');

    const result = await JournalManagementService.getJournalById(journalId);

    if (result.isErr()) {
      const error = result.error;

      if (error.message === 'Journal not found.') {
        logger.warn({ journalId, error: error.message, userId: req.user?.id }, 'Journal not found by ID.');
        return sendError(res, 'Journal not found.', 404);
      }

      logger.error({ error, journalId, userId: req.user?.id }, 'Failed to retrieve journal by ID.');
      return sendError(res, 'Failed to retrieve journal due to a server error.', 500);
    }

    const journalDetails = result.value;
    return sendSuccess(res, { journal: journalDetails }, 'Journal retrieved successfully.');
  } catch (error) {
    logger.error(
      {
        error,
        validatedParams: req.validatedData?.params,
        userId: req.user?.id,
      },
      'Unhandled error in showJournalController',
    );
    return sendError(res, 'An unexpected error occurred.', 500);
  }
};

export const showJournalProfileController = async (req: ShowJournalRequest, res: Response) => {
  const userId = req.user?.id;

  logger.info({ userId }, 'Attempting to retrieve journal profile');

  const result = await JournalManagementService.getJournalProfile(userId);

  if (result.isErr()) {
    const error = result.error;

    logger.error({ error, userId: req.user?.id }, 'Failed to retrieve journal profile.');
    return sendError(res, 'Failed to retrieve journal profile due to a server error.', 500);
  }

  const profiles = result.value;
  return sendSuccess(res, { profiles });
};
