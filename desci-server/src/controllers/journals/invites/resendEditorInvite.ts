import { Response } from 'express';
import _ from 'lodash';

import { sendError, sendSuccess } from '../../../core/api.js';
import { AuthenticatedRequest, ValidatedRequest } from '../../../core/types.js';
import { logger as parentLogger } from '../../../logger.js';
import { resendEditorInviteSchema } from '../../../schemas/journals.schema.js';
import { JournalInviteService } from '../../../services/journals/JournalInviteService.js';

const logger = parentLogger.child({
  module: 'Journals::ResendEditorInviteController',
});

type ResendEditorInviteRequest = ValidatedRequest<typeof resendEditorInviteSchema, AuthenticatedRequest>;

export const resendEditorInvite = async (req: ResendEditorInviteRequest, res: Response) => {
  try {
    const { journalId, inviteId } = req.validatedData.params;
    const { inviteTtlDays } = req.validatedData.body;
    const inviterId = req.user.id;

    logger.info({ journalId, inviteId, inviteTtlDays, inviterId }, 'Attempting to resend editor invite');

    const invite = await JournalInviteService.resendEditorInvite({
      inviteId,
      journalId,
      inviterId,
      inviteTtlDays,
    });

    return sendSuccess(
      res,
      { invite: _.omit(invite, ['token', 'decisionAt', 'accepted']) },
      'Editor invite resent successfully.',
    );
  } catch (error) {
    logger.error({ error }, 'Failed to resend editor invite');

    if (error.message === 'Invite not found') {
      return sendError(res, 'Invite not found', 404);
    }
    if (error.message === 'Invite not found for this journal') {
      return sendError(res, 'Invite not found for this journal', 404);
    }
    if (error.message === 'Cannot resend invite that has already been responded to') {
      return sendError(res, 'Cannot resend invite that has already been responded to', 400);
    }
    if (error.message === 'Journal not found') {
      return sendError(res, 'Journal not found', 404);
    }
    if (error.message === 'Inviter not found') {
      return sendError(res, 'Inviter not found', 404);
    }

    return sendError(res, 'Failed to resend editor invite', 500);
  }
};
