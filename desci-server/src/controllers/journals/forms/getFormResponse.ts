import { Request, Response, NextFunction } from 'express';
import _ from 'lodash';

import { sendSuccess } from '../../../core/api.js';
import { JournalFormService } from '../../../services/journals/JournalFormService.js';

export const getFormResponseController = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = (req as any).user.id;
    const { journalId, assignmentId, templateId } = req.params;

    const result = await JournalFormService.getOrCreateFormResponse(
      userId,
      parseInt(assignmentId),
      parseInt(templateId),
    );

    if (result.isErr()) {
      if (result.error.message.includes('not found')) {
        res.status(404).json({
          error: result.error.message,
        });
      } else if (result.error.message.includes('not authorized')) {
        res.status(403).json({
          error: result.error.message,
        });
      } else {
        res.status(400).json({
          error: 'Something went wrong',
        });
      }
      return;
    }

    const formResponse = result.value;

    sendSuccess(
      res,
      {
        formResponse: _.pick(formResponse, [
          'id',
          'templateId',
          'refereeAssignmentId',
          'reviewId',
          'status',
          'formData',
          'createdAt',
          'updatedAt',
        ]),
      },
      'Form response retrieved successfully',
    );
    return;
  } catch (error) {
    next(error);
  }
};
