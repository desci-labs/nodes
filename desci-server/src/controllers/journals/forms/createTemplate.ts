import { Response } from 'express';

import { sendError, sendSuccess } from '../../../core/api.js';
import { AuthenticatedRequest } from '../../../core/types.js';
import { logger as parentLogger } from '../../../logger.js';
import { JournalFormService } from '../../../services/journals/JournalFormService.js';

const logger = parentLogger.child({
  module: 'Journals::CreateFormTemplateController',
});

export const createFormTemplateController = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user.id;
    const { journalId } = req.params;
    const { name, description, structure } = req.body;

    logger.info({ userId, journalId }, 'Creating form template');

    const result = await JournalFormService.createFormTemplate(userId, {
      journalId: parseInt(journalId),
      name,
      description,
      structure,
    });

    if (result.isErr()) {
      const error = result.error;
      logger.error({ error, userId }, 'Failed to create form template');

      if (error.message.includes('Only chief editors')) {
        return sendError(res, error.message, 403);
      }

      if (error.message.includes('already exists')) {
        return sendError(res, error.message, 400);
      }

      return sendError(res, 'Failed to create form template', 500);
    }

    const template = result.value;
    return sendSuccess(res, { template }, 'Form template created successfully');
  } catch (error: any) {
    logger.error({ error, userId: req.user.id }, 'Unhandled error in createFormTemplateController');
    return sendError(res, 'An unexpected error occurred', 500);
  }
};
