import { SubmissionStatus } from '@prisma/client';
import { isBefore } from 'date-fns';
import { Response } from 'express';

import { sendError, sendSuccess } from '../../../core/api.js';
import { ValidatedRequest, AuthenticatedRequest } from '../../../core/types.js';
import { logger as parentLogger } from '../../../logger.js';
import { getSubmissionsSchema } from '../../../schemas/journals.schema.js';
import { JournalManagementService } from '../../../services/journals/JournalManagementService.js';
import { journalSubmissionService } from '../../../services/journals/JournalSubmissionService.js';

const logger = parentLogger.child({
  module: 'Journals::ShowUrgentJournalSubmissionsController',
});

type PendingSubmissionsRequest = ValidatedRequest<typeof getSubmissionsSchema, AuthenticatedRequest>;

export const getPendingSubmissionsController = async (req: PendingSubmissionsRequest, res: Response) => {
  try {
    const { journalId } = req.validatedData.params;

    const journal = await JournalManagementService.getJournalById(journalId);

    if (journal.isErr()) {
      return sendError(res, 'Journal not found.', 404);
    }

    const submissions = await journalSubmissionService.getUrgentJournalSubmissions(
      journalId,
      {
        status: { notIn: [SubmissionStatus.ACCEPTED, SubmissionStatus.REJECTED] },
      },
      20,
    );

    const data = submissions.map((submission) => ({
      ...submission,
      assignedEditor: submission.assignedEditor?.name,
      reviews: submission.refereeAssignments.map((review) => ({
        dueDate: review.dueDate,
        completed: review.completedAssignment,
        completedAt: review.completedAt,
        referee: review.referee?.name,
        refereeUserId: review.referee?.id,
      })),
      activeReferees: submission.refereeAssignments.length,
      refereeInvites: submission.RefereeInvite.map((invite) => ({
        accepted: invite.accepted,
        isDue: invite?.expiresAt ? isBefore(invite.expiresAt, new Date()) : false,
      })),
      RefereeInvite: void 0,
      refereeAssignments: void 0,
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
