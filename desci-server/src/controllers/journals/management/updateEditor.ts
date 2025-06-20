import { Response } from 'express';
import _ from 'lodash';

import { sendError, sendSuccess } from '../../../core/api.js';
import { AuthenticatedRequest, ValidatedRequest } from '../../../core/types.js';
import { logger as parentLogger } from '../../../logger.js';
import { updateEditorSchema } from '../../../schemas/journals.schema.js';
import { JournalManagementService } from '../../../services/journals/JournalManagementService.js';

const logger = parentLogger.child({
  module: 'Journals::UpdateEditorController',
});

type UpdateEditorRequest = ValidatedRequest<typeof updateEditorSchema, AuthenticatedRequest>;

export const updateEditorController = async (req: UpdateEditorRequest, res: Response) => {
  try {
    const { journalId } = req.validatedData.params;
    const { expertise, maxWorkload } = req.validatedData.body;
    const editorUserId = req.user.id;

    logger.info(
      { journalId, editorUserIdBeingChanged: editorUserId, expertise, maxWorkload, editorUserId },
      'Attempting to update editor',
    );

    const result = await JournalManagementService.updateEditor(journalId, editorUserId, {
      expertise,
      maxWorkload,
    });

    if (result.isErr()) {
      const error = result.error;
      logger.error(
        { error, journalId, editorUserIdBeingChanged: editorUserId, expertise, maxWorkload, editorUserId },
        'Failed to update editor',
      );

      if (error.message === 'Editor not found.') {
        return sendError(res, 'Editor not found in this journal.', 404);
      }

      return sendError(res, 'Failed to update editor due to a server error.', 500);
    }

    const updatedEditor = result.value;
    return sendSuccess(
      res,
      { editor: _.pick(updatedEditor, ['id', 'userId', 'role', 'expertise', 'maxWorkload']) },
      'Editor updated successfully.',
    );
  } catch (error) {
    logger.error(
      { error, params: req.params, userId: req.user?.id, body: req.body },
      'Unhandled error in updateEditorController',
    );
    return sendError(res, 'An unexpected error occurred.', 500);
  }
};
