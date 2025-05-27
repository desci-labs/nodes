import { NextFunction, Response } from 'express';
import _ from 'lodash';

import { sendError, sendSuccess } from '../../../core/api.js';
import { OptionalAuthenticatedRequest, ValidatedRequest } from '../../../core/types.js';
import { logger as parentLogger } from '../../../logger.js';
import { editorInviteDecisionSchema } from '../../../schemas/journals.schema.js';
import { JournalInviteService } from '../../../services/journals/JournalInviteService.js';

const logger = parentLogger.child({
  module: 'Journals::EditorInviteDecisionController',
});

type EditorInviteDecisionRequest = ValidatedRequest<typeof editorInviteDecisionSchema, OptionalAuthenticatedRequest>;

export const editorInviteDecision = async (req: EditorInviteDecisionRequest, res: Response, next: NextFunction) => {
  try {
    const { decision, token } = req.validatedData.body;
    const user = req.user; // User can be undefined, declining doesn't require auth.

    logger.info(
      { token: token.slice(0, 4) + '...', decision, userId: req.user?.id },
      'Processing editor invite decision',
    );

    let invite;
    if (decision === 'accept') {
      // For 'accept', user must be authenticated
      if (!req.user || !req.user.id) {
        logger.warn({ decision }, 'Accept decision requires authentication, but user is not authenticated.');
        return sendError(res, 'Authentication is required to accept this invitation.', 401);
      }
      invite = await JournalInviteService.acceptJournalInvite({ token, userId: user.id });
      return sendSuccess(res, { invite }, 'Editor invitation accepted successfully.');
    } else {
      // decision === 'decline'
      // For 'decline', user does not need to be authenticated
      invite = await JournalInviteService.declineJournalInvite({ token, userId: user?.id });
      return sendSuccess(
        res,
        {
          invite: _.pick(invite, ['id', 'role', 'inviterId', 'journalId', 'decisionAt', 'accepted', 'declined']),
        },
        'Editor invitation declined successfully.',
      );
    }
  } catch (error) {
    logger.error(
      { error, body: req.body, params: req.params, userId: req.user?.id },
      'Failed to process editor invite decision',
    );

    if (error.message === 'Invite not found' || error.message === 'Invite expired') {
      return sendError(res, error.message, 400);
    }
    return sendError(res, 'Failed to process editor invite decision', 500);
  }
};
