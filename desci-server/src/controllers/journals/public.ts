import { Prisma } from '@prisma/client';
import { Response } from 'express';

import { sendError, sendSuccess } from '../../core/api.js';
import { AuthenticatedRequest, ValidatedRequest } from '../../core/types.js';
import { logger } from '../../logger.js';
import { listJournalEditorsSchema } from '../../schemas/journals.schema.js';
import { JournalManagementService } from '../../services/journals/JournalManagementService.js';

type ListJournalEditorsRequest = ValidatedRequest<typeof listJournalEditorsSchema, AuthenticatedRequest>;

export const viewJournalEditors = async (req: ListJournalEditorsRequest, res: Response) => {
  try {
    const { journalId } = req.validatedData.params;
    const { workload, expertise, sortBy, sortOrder } = req.validatedData.query;

    const filter: Prisma.JournalEditorWhereInput = {
      journalId,
    };

    if (workload) {
      filter.maxWorkload = workload;
    }

    if (expertise) {
      filter.expertise = {
        hasSome: expertise,
      };
    }

    let orderBy: Prisma.JournalEditorOrderByWithRelationInput;

    if (sortBy) {
      if (sortBy === 'newest') {
        orderBy = {
          acceptedAt: sortOrder === 'desc' ? 'desc' : 'asc',
        };
      } else if (sortBy === 'oldest') {
        orderBy = {
          acceptedAt: sortOrder === 'desc' ? 'asc' : 'desc',
        };
      }
    }

    logger.trace({ filter, orderBy }, 'Filtering and ordering editors');
    const result = await JournalManagementService.getJournalEditors(journalId, filter, orderBy, false);
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
