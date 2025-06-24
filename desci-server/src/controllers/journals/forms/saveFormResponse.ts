import { Response } from 'express';

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

      return sendError(res, 'Failed to save form response', 500);
    }

    const response = result.value;
    return sendSuccess(res, { response }, 'Form response saved successfully');
  } catch (error: any) {
    logger.error({ error, userId: req.user.id }, 'Unhandled error in saveFormResponseController');
    return sendError(res, 'An unexpected error occurred', 500);
  }
};
