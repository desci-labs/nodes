import { Response } from 'express';

import { sendError, sendSuccess } from '../../../core/api.js';
import { AuthenticatedRequest, ValidatedRequest } from '../../../core/types.js';
import { logger as parentLogger } from '../../../logger.js';
import { updateEditorRoleSchema } from '../../../schemas/journals.schema.js';
import { JournalManagementService } from '../../../services/journals/JournalManagementService.js';

const logger = parentLogger.child({
  module: 'Journals::UpdateEditorRoleController',
});

type UpdateEditorRoleRequest = ValidatedRequest<typeof updateEditorRoleSchema, AuthenticatedRequest>;

export const updateEditorRoleController = async (req: UpdateEditorRoleRequest, res: Response) => {
  try {
    const { journalId, editorUserId } = req.validatedData.params;
    const { role } = req.validatedData.body;
    const managerId = req.user.id;

    logger.info(
      { journalId, editorUserIdBeingChanged: editorUserId, newRole: role, managerId },
      'Attempting to update editor role',
    );

    const result = await JournalManagementService.updateEditorRole(journalId, managerId, editorUserId, role);

    if (result.isErr()) {
      const error = result.error;
      logger.error(
        { error, journalId, editorUserIdBeingChanged: editorUserId, newRole: role, managerId },
        'Failed to update editor role',
      );

      if (error.message === 'Editor not found.') {
        return sendError(res, 'Editor not found in this journal.', 404);
      }

      if (error.message === 'Cannot demote yourself.') {
        return sendError(res, error.message, 403);
      }

      return sendError(res, 'Failed to update editor role due to a server error.', 500);
    }

    return sendSuccess(res, { message: 'Editor role updated successfully.' }, 'Editor role updated successfully.');
  } catch (error) {
    logger.error(
      { error, params: req.params, userId: req.user?.id, body: req.body },
      'Unhandled error in updateEditorRoleController',
    );
    return sendError(res, 'An unexpected error occurred.', 500);
  }
};
