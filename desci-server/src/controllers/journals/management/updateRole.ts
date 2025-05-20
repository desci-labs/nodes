import { EditorRole } from '@prisma/client'; // Import EditorRole
import { Response } from 'express';
import { z } from 'zod';

import { sendError, sendSuccess } from '../../../core/api.js';
import { AuthenticatedRequest } from '../../../core/types.js';
import { logger as parentLogger } from '../../../logger.js';
import { JournalManagementService } from '../../../services/journals/JournalManagementService.js';

const logger = parentLogger.child({
  module: 'Journals::UpdateEditorRoleController',
});

const UpdateEditorRoleParamsSchema = z.object({
  journalId: z.string().transform((val) => parseInt(val, 10)),
  editorId: z.string().transform((val) => parseInt(val, 10)),
});

const UpdateEditorRoleRequestBodySchema = z.object({
  role: z.nativeEnum(EditorRole),
});

interface UpdateEditorRoleRequest
  extends AuthenticatedRequest<
    z.input<typeof UpdateEditorRoleParamsSchema>,
    any,
    z.input<typeof UpdateEditorRoleRequestBodySchema>,
    any
  > {}

export const updateEditorRoleController = async (req: UpdateEditorRoleRequest, res: Response) => {
  try {
    const { journalId, editorId } = UpdateEditorRoleParamsSchema.parse(req.params);
    const { role } = UpdateEditorRoleRequestBodySchema.parse(req.body);
    const managerId = req.user.id;

    logger.info(
      { journalId, editorIdBeingChanged: editorId, newRole: role, managerId },
      'Attempting to update editor role',
    );

    const result = await JournalManagementService.updateEditorRole(journalId, managerId, editorId, role);

    if (result.isErr()) {
      const error = result.error;
      logger.error(
        { error, journalId, editorIdBeingChanged: editorId, newRole: role, managerId },
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
    if (error instanceof z.ZodError) {
      logger.warn(
        { errorDetails: error.flatten(), params: req.params, body: req.body },
        'Validation failed for editor role update request',
      );
      const formattedErrors = Object.entries(error.flatten().fieldErrors).flatMap(([field, messages]) =>
        (messages || []).map((message) => ({ field, message })),
      );
      return sendError(res, 'Validation failed', 400, formattedErrors);
    }

    logger.error(
      { error, params: req.params, userId: req.user?.id, body: req.body },
      'Unhandled error in updateEditorRoleController',
    );
    return sendError(res, 'An unexpected error occurred.', 500);
  }
};
