import { Response } from 'express';
import _ from 'lodash';

import { sendError, sendSuccess } from '../../../core/api.js';
import { AuthenticatedRequest, ValidatedRequest } from '../../../core/types.js';
import { logger as parentLogger } from '../../../logger.js';
import { inviteEditorSchema } from '../../../schemas/journals.schema.js';
import { JournalInviteService } from '../../../services/journals/JournalInviteService.js';

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
