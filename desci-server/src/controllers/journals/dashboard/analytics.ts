import { endOfDay, startOfDay } from 'date-fns';
import { Response } from 'express';
import { errWithCause } from 'pino-std-serializers';

import { sendError, sendSuccess } from '../../../core/api.js';
import { ValidatedRequest, AuthenticatedRequest } from '../../../core/types.js';
import { logger as parentLogger } from '../../../logger.js';
import { getJournalAnalyticsSchema } from '../../../schemas/journals.schema.js';
import { getJournalAnalytics } from '../../../services/journals/JournalAnalyticsService.js';
import { JournalManagementService } from '../../../services/journals/JournalManagementService.js';

//
const logger = parentLogger.child({
  module: 'Journals::ShowJournalAnalyticsController',
});

type ShowJournalAnalyticsRequest = ValidatedRequest<typeof getJournalAnalyticsSchema, AuthenticatedRequest>;

export const showJournalAnalyticsController = async (req: ShowJournalAnalyticsRequest, res: Response) => {
  try {
    const { journalId } = req.validatedData.params;
    const { startDate, endDate } = req.validatedData.query;

    await new Promise((resolve) => setTimeout(resolve, 3000));
    const journal = await JournalManagementService.getJournalById(journalId);

    if (journal.isErr()) {
      return sendError(res, 'Journal not found.', 404);
    }
    const from = startDate ? startOfDay(startDate) : null;
    const to = endDate ? endOfDay(endDate) : null;

    logger.info({ journalId, userId: req.user?.id, from, to }, 'Attempting to retrieve journal analytics');
    const data = await getJournalAnalytics({
      journalId,
      startDate: from,
      endDate: to,
    });

    logger.info({ data }, 'showJournalAnalyticsController');

    return sendSuccess(res, data);
  } catch (error) {
    logger.error(
      {
        error: errWithCause(error),
        validatedParams: req.validatedData?.params,
        userId: req.user?.id,
      },
      'Unhandled error in showJournalAnalyticsController',
    );
    return sendError(res, 'An unexpected error occurred.', 500);
  }
};
