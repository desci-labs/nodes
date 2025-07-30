import { Prisma } from '@prisma/client';
import { Response } from 'express';
import _ from 'lodash';

import { sendError, sendSuccess } from '../../../core/api.js';
import { AuthenticatedRequest, ValidatedRequest } from '../../../core/types.js';
import { logger as parentLogger } from '../../../logger.js';
import { getJournalSchema, inviteEditorSchema, listJournalEditorsSchema } from '../../../schemas/journals.schema.js';
import { JournalInviteService } from '../../../services/journals/JournalInviteService.js';
import { JournalManagementService } from '../../../services/journals/JournalManagementService.js';

const logger = parentLogger.child({
  module: 'Journals::InviteEditorController',
});

type InviteEditorRequest = ValidatedRequest<typeof inviteEditorSchema, AuthenticatedRequest>;

export const inviteEditor = async (req: InviteEditorRequest, res: Response) => {
  try {
    const { journalId } = req.validatedData.params;
    const { email, role, inviteTtlDays, name } = req.validatedData.body;
    const inviterId = req.user.id;

    logger.info({ journalId, email, role, inviteTtlDays, inviterId }, 'Attempting to invite editor');

    const invite = await JournalInviteService.inviteJournalEditor({
      journalId,
      inviterId,
      email,
      role,
      name,
      inviteTtlDays,
    });

    return sendSuccess(
      res,
      { invite: _.omit(invite, ['token', 'decisionAt', 'accepted']) },
      'Editor invited successfully.',
    );
  } catch (error) {
    logger.error({ error }, 'Failed to invite editor');
    return sendError(res, 'Failed to invite editor', 500);
  }
};

type ListJournalEditorsRequest = ValidatedRequest<typeof listJournalEditorsSchema, AuthenticatedRequest>;

export const listJournalEditors = async (req: ListJournalEditorsRequest, res: Response) => {
  try {
    const { journalId } = req.validatedData.params;
    const { workload, expertise, sortBy, sortOrder, availability } = req.validatedData.query;

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
    const result = await JournalManagementService.getJournalEditors(journalId, filter, orderBy);
    if (result.isErr()) {
      return sendError(res, result.error.message, 500);
    }

    let editors = result.value;

    if (availability) {
      if (availability === 'available') {
        editors = editors.filter((editor) => editor.available);
      } else if (availability === 'unavailable') {
        editors = editors.filter((editor) => !editor.available);
      }
    }

    return sendSuccess(res, editors);
  } catch (error) {
    logger.error({ error: error.toString(), errorMessage: error.message }, 'Failed to list journal editors');
    return sendError(res, 'Failed to list journal editors', 500);
  }
};

type ListJournalEditorialBoardRequest = ValidatedRequest<typeof getJournalSchema, AuthenticatedRequest>;

export const listJournalEditorialBoard = async (req: ListJournalEditorialBoardRequest, res: Response) => {
  try {
    const { journalId } = req.validatedData.params;

    logger.info({ journalId, userId: req.user?.id }, 'Attempting to retrieve journal by ID');

    const result = await JournalManagementService.getJournalEditorialBoardById(journalId);

    if (result.isErr()) {
      const error = result.error;

      if (error.message === 'Journal not found.') {
        logger.warn({ journalId, error: error.message, userId: req.user?.id }, 'Journal not found by ID.');
        return sendError(res, 'Journal not found.', 404);
      }

      logger.error({ error, journalId, userId: req.user?.id }, 'Failed to retrieve journal by ID.');
      return sendError(res, 'Failed to retrieve journal due to a server error.', 500);
    }

    const data = result.value;
    return sendSuccess(res, data);
  } catch (error) {
    logger.error(
      {
        error,
        validatedParams: req.validatedData?.params,
        userId: req.user?.id,
      },
      'Unhandled error in listJournalEditorialBoard',
    );
    return sendError(res, 'An unexpected error occurred.', 500);
  }
};
