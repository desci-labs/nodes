import { Response } from 'express';
import _ from 'lodash';

import { sendError, sendSuccess } from '../../../core/api.js';
import { AuthenticatedRequest } from '../../../core/types.js';
import { logger as parentLogger } from '../../../logger.js';
import { JournalFormService } from '../../../services/journals/JournalFormService.js';

const logger = parentLogger.child({
  module: 'Journals::SaveFormResponseController',
});

export const saveFormResponseController = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user.id;
    const { responseId } = req.params;
    const { fieldResponses } = req.body;

    if (!fieldResponses) {
      return sendError(res, 'fieldResponses is required in the body', 400);
    }

    logger.info({ userId, responseId }, 'Saving form response');
    const result = await JournalFormService.saveFormResponse(userId, parseInt(responseId), { fieldResponses });

    if (result.isErr()) {
      const error = result.error;
      logger.error({ error, userId }, 'Failed to save form response');

      if (error.message.includes('not found')) {
        return sendError(res, error.message, 404);
      }

      if (error.message.includes('Unauthorized')) {
        return sendError(res, error.message, 403);
      }

      if (error.message.includes('Cannot modify')) {
        return sendError(res, error.message, 400);
      }
      // Pass along Zod validation issues if they exist
      const cause = (error as any).cause;
      return sendError(res, 'Failed to save form response', 400, cause);
    }

    const formSaveResult = result.value;
    return sendSuccess(
      res,
      { saved: _.pick(formSaveResult, ['id', 'formId', 'createdAt', 'updatedAt', 'templateId', 'formData']) },
      'Form response saved successfully',
    );
  } catch (error: any) {
    logger.error({ error, userId: req.user.id }, 'Unhandled error in saveFormResponseController');
    return sendError(res, 'An unexpected error occurred', 500);
  }
};
