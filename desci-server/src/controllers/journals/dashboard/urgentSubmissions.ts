import { SubmissionStatus } from '@prisma/client';
import { endOfDay, isAfter, startOfDay, isBefore } from 'date-fns';
import { Response } from 'express';

import { sendError, sendSuccess } from '../../../core/api.js';
import { ValidatedRequest, AuthenticatedRequest } from '../../../core/types.js';
import { logger as parentLogger } from '../../../logger.js';
import { showUrgentSubmissionsSchema } from '../../../schemas/journals.schema.js';
import { JournalManagementService } from '../../../services/journals/JournalManagementService.js';
import { journalSubmissionService } from '../../../services/journals/JournalSubmissionService.js';

const logger = parentLogger.child({
  module: 'Journals::ShowUrgentJournalSubmissionsController',
});

type ShowUrgentJournalSubmissionsRequest = ValidatedRequest<typeof showUrgentSubmissionsSchema, AuthenticatedRequest>;
const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;
export const showUrgentJournalSubmissionsController = async (
  req: ShowUrgentJournalSubmissionsRequest,
  res: Response,
) => {
  try {
    const { journalId } = req.validatedData.params;
    const { startDate, endDate } = req.validatedData.query;

    const journal = await JournalManagementService.getJournalById(journalId);

    if (journal.isErr()) {
      return sendError(res, 'Journal not found.', 404);
    }

    const from = startDate ? startOfDay(startDate) : null;
    const to = endDate ? endOfDay(endDate) : null;
    logger.info({ journalId, userId: req.user?.id, from, to }, 'Attempting to retrieve urgent journal submissions');

    const submissions = await journalSubmissionService.getUrgentJournalSubmissions(
      journalId,
      {
        status: { notIn: [SubmissionStatus.ACCEPTED, SubmissionStatus.REJECTED] },
        ...(from && to
          ? {
              submittedAt: { gte: from, lte: to },
            }
          : {}),
      },
      20,
    );

    // filter submissions that have referee assignments that are due in the next 7 days
    const urgentSubmissions = submissions.filter((submission) =>
      submission.refereeAssignments.some(
        (assignment) =>
          isBefore(new Date(), assignment.dueDate) && isAfter(new Date(Date.now() + SEVEN_DAYS), assignment.dueDate),
      ),
    );
    const data = urgentSubmissions.map((submission) => ({
      ...submission,
      title: submission.node.title,
      node: null,
    }));

    logger.info({ data }, 'showUrgentJournalSubmissionsController');

    return sendSuccess(res, data);
  } catch (error) {
    logger.error(
      {
        error,
        validatedParams: req.validatedData?.params,
        userId: req.user?.id,
      },
      'Unhandled error in showUrgentJournalSubmissionsController',
    );
    return sendError(res, 'An unexpected error occurred.', 500);
  }
};
