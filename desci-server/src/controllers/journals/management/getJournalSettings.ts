import { Response } from 'express';

import { sendError, sendSuccess } from '../../../core/api.js';
import { AuthenticatedRequest, ValidatedRequest } from '../../../core/types.js';
import { logger as parentLogger } from '../../../logger.js';
import { getJournalSettingsSchema } from '../../../schemas/journals.schema.js';
import { JournalManagementService } from '../../../services/journals/JournalManagementService.js';

const logger = parentLogger.child({
  module: 'Journals::GetJournalSettingsController',
});

type GetJournalSettingsRequest = ValidatedRequest<typeof getJournalSettingsSchema, AuthenticatedRequest>;

export const getJournalSettingsController = async (req: GetJournalSettingsRequest, res: Response) => {
  try {
    const { journalId } = req.validatedData.params;
    const userId = req.user.id;

    logger.info({ journalId, userId }, 'Attempting to get journal settings');

    const result = await JournalManagementService.getJournalSettings(journalId);

    if (result.isErr()) {
      const error = result.error;
      logger.error({ error, journalId, userId }, 'Failed to get journal settings');

      if (error.message === 'Journal not found.') {
        return sendError(res, 'Journal not found.', 404);
      }

      return sendError(res, 'Failed to get journal settings due to a server error.', 500);
    }

    const { description, aboutArticle, editorialBoardArticle, authorInstruction, refereeInstruction, settings } =
      result.value;
    return sendSuccess(
      res,
      { description, aboutArticle, editorialBoardArticle, authorInstruction, refereeInstruction, settings },
      'Journal settings retrieved successfully.',
    );
  } catch (error) {
    logger.error(
      { error, params: req.params, userId: req.user?.id },
      'Unhandled error in getJournalSettingsController',
    );
    return sendError(res, 'An unexpected error occurred.', 500);
  }
};
