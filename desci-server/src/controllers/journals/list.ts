import { Response, Request } from 'express';

import { sendError, sendSuccess } from '../../../core/api.js';
import { logger as parentLogger } from '../../../logger.js';
import { JournalManagementService } from '../../../services/journals/JournalManagementService.js';

const logger = parentLogger.child({
  module: 'Journals::ListJournalsController',
});

export const listJournalsController = async (req: Request, res: Response) => {
  try {
    logger.info('Attempting to list all journals');

    const result = await JournalManagementService.listJournals();

    if (result.isErr()) {
      const error = result.error;
      logger.error({ error }, 'Failed to list journals');
      return sendError(res, 'Failed to retrieve journals due to a server error.', undefined, 500);
    }

    const journals = result.value;
    return sendSuccess(res, { journals }, 'Journals listed successfully.');
  } catch (error) {
    logger.error({ error, userId: (req as any).user?.id }, 'Unhandled error in listJournalsController');
    return sendError(res, 'An unexpected error occurred while retrieving journals.', undefined, 500);
  }
};
