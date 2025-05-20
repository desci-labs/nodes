import { Response } from 'express';
import { z } from 'zod';

import { sendError, sendSuccess } from '../../../core/api.js';
import { AuthenticatedRequest, ValidatedRequest } from '../../../core/types.js';
import { logger as parentLogger } from '../../../logger.js';
import { removeEditorSchema } from '../../../schemas/journals.schema.js';
import { JournalManagementService } from '../../../services/journals/JournalManagementService.js';

const logger = parentLogger.child({
  module: 'Journals::RemoveEditorController',
});

type RemoveEditorRequest = ValidatedRequest<typeof removeEditorSchema, AuthenticatedRequest>;

export const removeEditorController = async (req: RemoveEditorRequest, res: Response) => {
  try {
    const { journalId, editorId } = req.validatedData.params;
    const managerId = req.user.id;

    logger.info({ journalId, editorIdToRemove: editorId, managerId }, 'Attempting to remove editor from journal');

    const result = await JournalManagementService.removeEditorFromJournal(journalId, managerId, editorId);

    if (result.isErr()) {
      const error = result.error;
      logger.error({ error, journalId, editorIdToRemove: editorId, managerId }, 'Failed to remove editor');

      if (error.message === 'Editor not found.') {
        return sendError(res, 'Editor not found in this journal.', 404);
      }
      if (error.message === 'Cannot remove yourself as a CHIEF_EDITOR.') {
        return sendError(res, error.message, 403);
      }

      return sendError(res, 'Failed to remove editor due to a server error.', 500);
    }

    return sendSuccess(res, { message: 'Editor removed successfully.' }, 'Editor removed successfully.');
  } catch (error) {
    if (error instanceof z.ZodError) {
      logger.warn({ errorDetails: error.flatten(), params: req.params }, 'Validation failed for remove editor request');
      const formattedErrors = Object.entries(error.flatten().fieldErrors).flatMap(([field, messages]) =>
        (messages || []).map((message) => ({ field, message })),
      );
      return sendError(res, 'Validation failed', 400, formattedErrors);
    }

    logger.error({ error, params: req.params, userId: req.user?.id }, 'Unhandled error in removeEditorController');
    return sendError(res, 'An unexpected error occurred.', 500);
  }
};
