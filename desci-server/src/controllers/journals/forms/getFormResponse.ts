import { Request, Response, NextFunction } from 'express';

import { JournalFormService } from '../../../services/journals/JournalFormService.js';

export const getFormResponseController = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = (req as any).user.id;
    const { journalId, assignmentId, templateId } = req.params;

    const result = await JournalFormService.getOrCreateFormResponse(parseInt(assignmentId), parseInt(templateId));

    if (result.isErr()) {
      res.status(400).json({
        error: result.error.message,
      });
      return;
    }

    // Verify the user is the referee
    if (result.value.RefereeAssignment?.refereeId !== userId) {
      res.status(403).json({
        error: 'Unauthorized to access this form response',
      });
      return;
    }

    res.json(result.value);
  } catch (error) {
    next(error);
  }
};
