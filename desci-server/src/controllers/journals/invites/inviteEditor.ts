import { EditorRole } from '@prisma/client';
import { Response } from 'express';
import _ from 'lodash';
import { z } from 'zod';

import { sendError, sendSuccess } from '../../../core/api.js';
import { AuthenticatedRequest } from '../../../core/types.js';
import { logger as parentLogger } from '../../../logger.js';
import { JournalInviteService } from '../../../services/journals/JournalInviteService.js';

const logger = parentLogger.child({
  module: 'Journals::InviteEditorController',
});

const InviteEditorParamsSchema = z.object({
  journalId: z.string().transform((val) => parseInt(val, 10)),
});

const InviteEditorRequestBodySchema = z.object({
  email: z.string().email(),
  role: z.nativeEnum(EditorRole),
});

interface InviteEditorRequest
  extends AuthenticatedRequest<
    z.input<typeof InviteEditorParamsSchema>,
    any,
    z.input<typeof InviteEditorRequestBodySchema>,
    any
  > {}

export const inviteEditor = async (req: InviteEditorRequest, res: Response) => {
  try {
    const { journalId } = InviteEditorParamsSchema.parse(req.params);
    const { email, role } = InviteEditorRequestBodySchema.parse(req.body);
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
    if (error instanceof z.ZodError) {
      logger.warn({ error }, 'Validation failed');
      const formattedErrors = Object.entries(error.flatten().fieldErrors).flatMap(([field, messages]) =>
        (messages || []).map((message) => ({ field, message })),
      );
      return sendError(res, 'Validation failed', 400, formattedErrors);
    }
    logger.error({ error }, 'Failed to invite editor');
    return sendError(res, 'Failed to invite editor', 500);
  }
};
