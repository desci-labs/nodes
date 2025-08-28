import { Prisma } from '@prisma/client';
import { Response } from 'express';

import { sendError, sendSuccess } from '../../core/api.js';
import { OptionalAuthenticatedRequest, ValidatedRequest } from '../../core/types.js';
import { logger } from '../../logger.js';
import { listJournalEditorsSchema } from '../../schemas/journals.schema.js';
import { JournalManagementService } from '../../services/journals/JournalManagementService.js';

type ListJournalEditorsRequest = ValidatedRequest<typeof listJournalEditorsSchema, OptionalAuthenticatedRequest>;

export const viewJournalEditors = async (req: ListJournalEditorsRequest, res: Response) => {
  try {
    const { journalId } = req.validatedData.params;

    const filter: Prisma.JournalEditorWhereInput = {
      journalId,
    };

    const result = await JournalManagementService.getJournalEditors(journalId, filter, {}, false);
    if (result.isErr()) {
      return sendError(res, result.error.message, 500);
    }

    const editors = result.value;

    return sendSuccess(res, editors);
  } catch (error) {
    logger.error({ error: error.toString(), errorMessage: error.message }, 'Failed to list journal editors');
    return sendError(res, 'Failed to list journal editors', 500);
  }
};
