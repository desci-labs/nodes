import { Response } from 'express';

import { prisma } from '../../../client.js';
import { sendError, sendSuccess } from '../../../core/api.js';
import { AuthenticatedRequest } from '../../../core/types.js';
import { logger as parentLogger } from '../../../logger.js';
import { JournalFormService } from '../../../services/journals/JournalFormService.js';

const logger = parentLogger.child({
  module: 'Journals::GetRefereeFormStatusController',
});

export const getRefereeFormStatusController = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { journalId, assignmentId } = req.params;
    const userId = req.user.id;

    logger.info({ journalId, assignmentId, userId }, 'Getting referee form status');

    // Verify the assignment exists and belongs to the journal
    const assignment = await prisma.refereeAssignment.findFirst({
      where: {
        id: parseInt(assignmentId),
        journalId: parseInt(journalId),
      },
      include: {
        submission: {
          include: {
            journal: true,
          },
        },
      },
    });

    if (!assignment) {
      return sendError(res, 'Referee assignment not found', 404);
    }

    // Check authorization - must be the referee, assigned editor, or chief editor
    const isReferee = assignment.refereeId === userId;
    const isAssignedEditor = assignment.submission.assignedEditorId === userId;

    const editor = await prisma.journalEditor.findFirst({
      where: {
        journalId: parseInt(journalId),
        userId: userId,
      },
    });
    const isEditor = !!editor;

    if (!isReferee && !isAssignedEditor && !isEditor) {
      return sendError(res, 'Not authorized to view this referee form status', 403);
    }

    // Get the form status
    const result = await JournalFormService.getRefereeFormStatus(parseInt(assignmentId));

    if (result.isErr()) {
      logger.error({ error: result.error }, 'Failed to get referee form status');
      return sendError(res, 'Failed to get referee form status', 500);
    }

    const status = result.value;

    return sendSuccess(
      res,
      {
        expectedTemplates: status.expectedTemplates.map((t) => ({
          id: t.id,
          name: t.name,
          description: t.description,
          version: t.version,
        })),
        completedTemplateIds: status.completedTemplateIds,
        pendingTemplateIds: status.pendingTemplateIds,
        totalExpected: status.expectedTemplates.length,
        totalCompleted: status.completedTemplateIds.length,
        formResponses: status.formResponses.map((r) => ({
          id: r.id,
          templateId: r.templateId,
          status: r.status,
          startedAt: r.startedAt,
          submittedAt: r.submittedAt,
        })),
      },
      'Referee form status retrieved successfully',
    );
  } catch (error: any) {
    logger.error({ error, userId: req.user.id }, 'Unhandled error in getRefereeFormStatusController');
    return sendError(res, 'An unexpected error occurred', 500);
  }
};
