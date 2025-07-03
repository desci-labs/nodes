import { Response } from 'express';
import _ from 'lodash';

import { prisma } from '../../../client.js';
import { sendError, sendSuccess } from '../../../core/api.js';
import { AuthenticatedRequest } from '../../../core/types.js';
import { logger as parentLogger } from '../../../logger.js';
import { JournalFormService } from '../../../services/journals/JournalFormService.js';

const logger = parentLogger.child({
  module: 'Journals::GetFormTemplateController',
});

export const getFormTemplateController = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user.id;
    const { journalId, templateId } = req.params;

    logger.info({ userId, journalId, templateId }, 'Getting form template');

    // First get the template to check if it exists and belongs to the journal
    const templateResult = await JournalFormService.getFormTemplate(parseInt(templateId));

    if (templateResult.isErr()) {
      logger.error({ error: templateResult.error, userId }, 'Failed to get form template');

      if (templateResult.error.message === 'Template not found') {
        return sendError(res, 'Template not found', 404);
      }

      // For any other errors, return a generic message
      return sendError(res, 'Failed to retrieve template', 500);
    }

    const template = templateResult.value;

    // Verify template belongs to the specified journal
    if (template.journalId !== parseInt(journalId)) {
      logger.warn({ userId, journalId, templateId }, 'Template does not belong to journal');
      return sendError(res, 'Template not found in this journal', 404);
    }

    // Check authorization
    // Valid editor or valid referee
    const editor = await prisma.journalEditor.findFirst({
      where: {
        journalId: parseInt(journalId),
        userId: userId,
      },
    });

    const isEditor = editor !== null;

    // If not an editor, check if user is a referee with this template assigned
    let isAssignedReferee = false;
    if (!isEditor) {
      const refereeAssignment = await prisma.refereeAssignment.findFirst({
        where: {
          userId: userId,
          journalId: parseInt(journalId),
          expectedFormTemplateIds: {
            has: parseInt(templateId),
          },
        },
      });
      isAssignedReferee = refereeAssignment !== null;
    }

    // User must be either an editor or an assigned referee
    if (!isEditor && !isAssignedReferee) {
      logger.warn({ userId, journalId, templateId }, 'User not authorized to view template');
      return sendError(res, 'Not authorized to view this template', 403);
    }

    return sendSuccess(
      res,
      {
        template: _.pick(template, [
          'id',
          'formUuid',
          'name',
          'journalId',
          'description',
          'structure',
          'version',
          'isActive',
          'createdById',
          'updatedAt',
        ]),
      },
      'Template retrieved successfully',
    );
  } catch (error: any) {
    logger.error({ error, userId: req.user.id }, 'Unhandled error in getFormTemplateController');
    return sendError(res, 'An unexpected error occurred', 500);
  }
};
