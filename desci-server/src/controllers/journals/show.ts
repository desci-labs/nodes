import { Response } from 'express';

import { sendError, sendSuccess } from '../../core/api.js';
import { OptionalAuthenticatedRequest } from '../../core/types.js';
import { logger as parentLogger } from '../../logger.js';
import { JournalManagementService } from '../../services/journals/JournalManagementService.js';

const logger = parentLogger.child({
  module: 'Journals::ShowJournalController',
});

interface GetJournalRequest extends OptionalAuthenticatedRequest {
  params: {
    journalId: number;
  };
}

export const showJournalController = async (req: GetJournalRequest, res: Response) => {
  try {
    const { journalId } = req.params;

    logger.info({ journalId }, 'Attempting to retrieve journal by ID');

    const result = await JournalManagementService.getJournalById(journalId);

    if (result.isErr()) {
      const error = result.error;

      if (error.message === 'Journal not found.') {
        logger.warn({ journalId, error: error.message }, 'Journal not found by ID.');
        return sendError(res, 'Journal not found.', 404);
      }

      logger.error({ error, journalId }, 'Failed to retrieve journal by ID.');
      return sendError(res, 'Failed to retrieve journal due to a server error.', 500);
    }

    const journalDetails = result.value;
    return sendSuccess(res, { journal: journalDetails }, 'Journal retrieved successfully.');
  } catch (error) {
    logger.error({ error, params: req.params, userId: req.user?.id }, 'Unhandled error in showJournalController');
    return sendError(res, 'An unexpected error occurred.', 500);
  }
};
