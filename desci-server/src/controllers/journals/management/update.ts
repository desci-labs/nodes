import { Response } from 'express';

import { sendError, sendSuccess } from '../../../core/api.js';
import { AuthenticatedRequest, ValidatedRequest } from '../../../core/types.js';
import { logger as parentLogger } from '../../../logger.js';
import { updateJournalSchema } from '../../../schemas/journals.schema.js';
import { JournalManagementService } from '../../../services/journals/JournalManagementService.js';

const logger = parentLogger.child({
  module: 'Journals::UpdateJournalController',
});

type UpdateJournalRequest = ValidatedRequest<typeof updateJournalSchema, AuthenticatedRequest>;

export const updateJournalController = async (req: UpdateJournalRequest, res: Response) => {
  try {
    const { journalId } = req.validatedData.params;
    const updateData = req.validatedData.body;
    const userId = req.user.id;

    if (Object.keys(updateData).length === 0) {
      return sendError(res, 'No update data provided.', 400);
    }

    logger.info({ journalId, userId, updateData }, 'Attempting to update journal');

    const result = await JournalManagementService.updateJournal(journalId, userId, updateData);

    if (result.isErr()) {
      const error = result.error;
      logger.error({ error, journalId, userId, body: req.body }, 'Failed to update journal');

      if (error.message === 'Journal not found.') {
        return sendError(res, 'Journal not found.', 404);
      }
      if (error.message && error.message.toLowerCase().includes('unique constraint failed')) {
        return sendError(res, 'Failed to update journal due to a conflict. The name might already be in use.', 409);
      }

      return sendError(res, 'Failed to update journal due to a server error.', 500);
    }

    const updatedJournal = result.value;
    return sendSuccess(res, { journal: updatedJournal }, 'Journal updated successfully.');
  } catch (error) {
    logger.error(
      { error, journalId: req.params?.journalId, userId: req.user?.id, body: req.body },
      'Failed to update journal',
    );
    return sendError(res, 'Failed to update journal', 500);
  }
};
