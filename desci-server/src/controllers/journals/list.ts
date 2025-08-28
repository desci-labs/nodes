import { Response, Request } from 'express';

import { sendError, sendSuccess } from '../../core/api.js';
import { OptionalAuthenticatedRequest, ValidatedRequest } from '../../core/types.js';
import { logger as parentLogger } from '../../logger.js';
import { listJournalsSchema } from '../../schemas/journals.schema.js';
import { JournalManagementService } from '../../services/journals/JournalManagementService.js';

const logger = parentLogger.child({
  module: 'Journals::ListJournalsController',
});

type ListJournalsRequest = ValidatedRequest<typeof listJournalsSchema, OptionalAuthenticatedRequest>;

/**
 * @param participatingOnly - If true, only journals that the user is participating in will be returned.
 */
export const listJournalsController = async (req: ListJournalsRequest, res: Response) => {
  try {
    const { participatingOnly } = req.validatedData.query;
    const user = req.user;
    logger.info({ participatingOnly, userId: user?.id }, 'Attempting to list all journals');

    const result = await JournalManagementService.listJournals(participatingOnly ? user?.id : undefined);

    if (result.isErr()) {
      const error = result.error;
      logger.error({ error }, 'Failed to list journals');
      return sendError(res, 'Failed to retrieve journals due to a server error.', 500);
    }

    const journals = result.value?.map((journal) => ({
      ...journal,
      publicationCount: journal.submissions?.length ?? 0,
    }));
    return sendSuccess(res, { journals });
  } catch (error) {
    logger.error({ error, userId: (req as any).user?.id }, 'Unhandled error in listJournalsController');
    return sendError(res, 'An unexpected error occurred while retrieving journals.', 500);
  }
};
