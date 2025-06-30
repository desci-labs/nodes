import { Response } from 'express';
import _ from 'lodash';

import { sendError, sendSuccess } from '../../../core/api.js';
import { AuthenticatedRequest } from '../../../core/types.js';
import { logger as parentLogger } from '../../../logger.js';
import { JournalFormService } from '../../../services/journals/JournalFormService.js';

const logger = parentLogger.child({
  module: 'Journals::SubmitFormResponseController',
});

export const submitFormResponseController = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user.id;
    const { responseId } = req.params;
    const { fieldResponses } = req.body;

    logger.info({ userId, responseId }, 'Submitting form response');

    const result = await JournalFormService.submitFormResponse(userId, parseInt(responseId), fieldResponses);

    if (result.isErr()) {
      const error = result.error as Error & { cause?: any };
      logger.error({ error, userId, cause: error.cause }, 'Failed to submit form response');

      if (error.message.includes('not found')) {
        return sendError(res, error.message, 404);
      }

      if (error.message.includes('Unauthorized')) {
        return sendError(res, error.message, 403);
      }

      if (error.message.includes('already submitted')) {
        return sendError(res, error.message, 400);
      }

      // Handle validation errors from the service
      if (error.cause) {
        return sendError(res, error.message, 400, error.cause);
      }

      return sendError(res, 'Failed to submit form response', 500);
    }

    const response = result.value;
    return sendSuccess(
      res,
      {
        submitted: _.pick(response, [
          'id',
          'formId',
          'refereeAssignmentId',
          'reviewId',
          'createdAt',
          'updatedAt',
          'submittedAt',
          'templateId',
          'status',
          'formData',
        ]),
      },
      'Form response submitted successfully',
    );
  } catch (error: any) {
    logger.error({ error, userId: req.user.id }, 'Unhandled error in submitFormResponseController');
    return sendError(res, 'An unexpected error occurred', 500);
  }
};
