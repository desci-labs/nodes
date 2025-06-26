import { Response } from 'express';

import { sendError, sendSuccess } from '../../../core/api.js';
import { AuthenticatedRequest } from '../../../core/types.js';
import { logger as parentLogger } from '../../../logger.js';
import { JournalFormService } from '../../../services/journals/JournalFormService.js';

const logger = parentLogger.child({
  module: 'Journals::ListFormTemplatesController',
});

export const listFormTemplatesController = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { journalId } = req.params;
    const { includeInactive } = req.query;

    logger.info({ journalId, includeInactive }, 'Listing form templates');

    const result = await JournalFormService.getJournalFormTemplates(parseInt(journalId), includeInactive === 'true');

    if (result.isErr()) {
      logger.error({ error: result.error }, 'Failed to list form templates');
      return sendError(res, 'Failed to retrieve form templates', 500);
    }

    const templates = result.value;
    return sendSuccess(res, { templates }, 'Form templates retrieved successfully');
  } catch (error: any) {
    logger.error({ error }, 'Unhandled error in listFormTemplatesController');
    return sendError(res, 'An unexpected error occurred', 500);
  }
};
