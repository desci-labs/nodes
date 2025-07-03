import { Response } from 'express';
import _ from 'lodash';

import { sendError, sendSuccess } from '../../../core/api.js';
import { AuthenticatedRequest } from '../../../core/types.js';
import { logger as parentLogger } from '../../../logger.js';
import { JournalFormService } from '../../../services/journals/JournalFormService.js';

const logger = parentLogger.child({
  module: 'Journals::UpdateFormTemplateController',
});

export const updateFormTemplateController = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user.id;
    const { journalId, templateId } = req.params;
    const { name, description, isActive, structure } = req.body;

    logger.info({ userId, journalId, templateId }, 'Updating form template');

    // First check if the template exists and belongs to the specified journal
    const templateResult = await JournalFormService.getFormTemplate(parseInt(templateId));
    if (templateResult.isErr()) {
      return sendError(res, 'Template not found', 404);
    }

    const existingTemplate = templateResult.value;
    if (existingTemplate.journalId !== parseInt(journalId)) {
      return sendError(res, 'Template not found', 404);
    }

    const result = await JournalFormService.updateFormTemplate(userId, parseInt(templateId), {
      name,
      description,
      isActive,
      structure,
    });

    if (result.isErr()) {
      const error = result.error;
      logger.error({ error, userId }, 'Failed to update form template');

      if (error.message.includes('Template not found')) {
        return sendError(res, error.message, 404);
      }

      if (error.message.includes('Only chief editors')) {
        return sendError(res, error.message, 403);
      }

      if (error.message.includes('Invalid form structure')) {
        return sendError(res, error.message, 400);
      }

      return sendError(res, 'Failed to update form template', 500);
    }

    const template = result.value;
    return sendSuccess(
      res,
      {
        template: _.pick(template, [
          'id',
          'formUuid',
          'journalId',
          'name',
          'description',
          'version',
          'isActive',
          'structure',
          'createdById',
          'createdAt',
          'updatedAt',
        ]),
      },
      'Form template updated successfully',
    );
  } catch (error: any) {
    logger.error({ error, userId: req.user.id }, 'Unhandled error in updateFormTemplateController');
    return sendError(res, 'An unexpected error occurred', 500);
  }
};
