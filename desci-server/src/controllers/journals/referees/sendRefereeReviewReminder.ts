import { Response } from 'express';

import { sendError, sendSuccess } from '../../../core/api.js';
import { AuthenticatedRequest, ValidatedRequest } from '../../../core/types.js';
import { logger as parentLogger } from '../../../logger.js';
import { sendRefereeReviewReminderSchema } from '../../../schemas/journals.schema.js';
import { JournalRefereeManagementService } from '../../../services/journals/JournalRefereeManagementService.js';

const logger = parentLogger.child({
  module: 'Journals::SendRefereeReviewReminderController',
});

type SendRefereeReviewReminderRequest = ValidatedRequest<typeof sendRefereeReviewReminderSchema, AuthenticatedRequest>;

export const sendRefereeReviewReminderController = async (req: SendRefereeReviewReminderRequest, res: Response) => {
  try {
    const { submissionId } = req.validatedData.params;
    const { refereeUserId } = req.validatedData.body;
    const editorUserId = req.user.id;

    logger.info({ submissionId, refereeUserId, editorUserId }, 'Attempting to send referee review reminder');

    const result = await JournalRefereeManagementService.sendRefereeReviewReminder({
      submissionId: Number(submissionId),
      refereeUserId,
      editorUserId,
    });

    if (result.isErr()) {
      const error = result.error;
      logger.error(
        { error, body: req.body, params: req.params, user: req.user },
        'Failed to send referee review reminder',
      );

      // Handle specific controlled errors with appropriate HTTP status codes
      if (error.message === 'Submission not found') {
        return sendError(res, error.message, 400);
      }
      if (error.message === 'Editor not authorized for this submission') {
        return sendError(res, error.message, 403);
      }
      if (error.message === 'Referee not found') {
        return sendError(res, error.message, 400);
      }
      if (error.message === 'Referee assignment not found') {
        return sendError(res, error.message, 400);
      }
      if (error.message === 'A reminder was recently sent. Please try again later.') {
        return sendError(res, error.message, 429);
      }

      return sendError(res, error.message, 500);
    }

    return sendSuccess(res, null, 'Referee review reminder sent successfully.');
  } catch (error) {
    logger.error(
      { error, body: req.body, params: req.params, user: req.user },
      'Unhandled error in sendRefereeReviewReminderController',
    );
    return sendError(res, 'An unexpected error occurred', 500);
  }
};
