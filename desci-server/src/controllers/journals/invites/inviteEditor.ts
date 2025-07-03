import { Prisma } from '@prisma/client';
import { Response } from 'express';
import _ from 'lodash';

import { sendError, sendSuccess } from '../../../core/api.js';
import { AuthenticatedRequest, ValidatedRequest } from '../../../core/types.js';
import { logger as parentLogger } from '../../../logger.js';
import { inviteEditorSchema, listJournalEditorsSchema } from '../../../schemas/journals.schema.js';
import { JournalInviteService } from '../../../services/journals/JournalInviteService.js';
import { JournalManagementService } from '../../../services/journals/JournalManagementService.js';

const logger = parentLogger.child({
  module: 'Journals::InviteEditorController',
});

type InviteEditorRequest = ValidatedRequest<typeof inviteEditorSchema, AuthenticatedRequest>;

export const inviteEditor = async (req: InviteEditorRequest, res: Response) => {
  try {
    const { journalId } = req.validatedData.params;
    const { email, role } = req.validatedData.body;
    const inviterId = req.user.id;

    logger.info({ journalId, email, role, inviterId }, 'Attempting to invite editor');

    const invite = await JournalInviteService.inviteJournalEditor({
      journalId,
      inviterId,
      email,
      role,
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
