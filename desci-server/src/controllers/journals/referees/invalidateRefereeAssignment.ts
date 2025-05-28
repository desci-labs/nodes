import { Response } from 'express';
import { z } from 'zod';

import { sendError, sendSuccess } from '../../../core/api.js';
import { AuthenticatedRequest, ValidatedRequest } from '../../../core/types.js';
import { logger as parentLogger } from '../../../logger.js';
import { invalidateRefereeAssignmentSchema } from '../../../schemas/journals.schema.js';
import { JournalRefereeManagementService } from '../../../services/journals/JournalRefereeManagementService.js';

const logger = parentLogger.child({
  module: 'Journals::InvalidateRefereeAssignmentController',
});

type InvalidateRefereeAssignmentRequest = ValidatedRequest<
  typeof invalidateRefereeAssignmentSchema,
  AuthenticatedRequest
>;

export const invalidateRefereeAssignmentController = async (req: InvalidateRefereeAssignmentRequest, res: Response) => {
  try {
    const { assignmentId } = req.validatedData.params;

    logger.info({ assignmentId, managerId: req.user.id }, 'Attempting to invalidate referee assignment');

    const result = await JournalRefereeManagementService.invalidateRefereeAssignment(parseInt(assignmentId));

    if (result.isErr()) {
      const error = result.error;
      logger.error({ error, assignmentId, managerId: req.user.id }, 'Failed to invalidate referee assignment');

      if (error.message.toLowerCase().includes('not found')) {
        return sendError(res, 'Referee assignment not found.', 404);
      }

      return sendError(res, 'Failed to invalidate referee assignment due to a server error.', 500);
    }

    return sendSuccess(
      res,
      { message: 'Referee assignment invalidated successfully.' },
      'Referee assignment invalidated successfully.',
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      logger.warn(
        { errorDetails: error.flatten(), params: req.params },
        'Validation failed for invalidate referee assignment request',
      );
      const formattedErrors = Object.entries(error.flatten().fieldErrors).flatMap(([field, messages]) =>
        (messages || []).map((message) => ({ field, message })),
      );
      return sendError(res, 'Validation failed', 400, formattedErrors);
    }

    logger.error(
      { error, params: req.params, userId: req.user?.id },
      'Unhandled error in invalidateRefereeAssignmentController',
    );
    return sendError(res, 'An unexpected error occurred.', 500);
  }
};
