import { NextFunction, Response } from 'express';
import _ from 'lodash';

import { sendError, sendSuccess } from '../../../core/api.js';
import { OptionalAuthenticatedRequest, ValidatedRequest } from '../../../core/types.js';
import { logger as parentLogger } from '../../../logger.js';
import { refereeInviteDecisionSchema } from '../../../schemas/journals.schema.js';
import { JournalRefereeManagementService } from '../../../services/journals/JournalRefereeManagementService.js';

const logger = parentLogger.child({
  module: 'Journals::RefereeInviteDecisionController',
});

type RefereeInviteDecisionRequest = ValidatedRequest<typeof refereeInviteDecisionSchema, OptionalAuthenticatedRequest>;

export const refereeInviteDecisionController = async (
  req: RefereeInviteDecisionRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { decision, token } = req.validatedData.body;
    const user = req.user; // User can be undefined for declining

    logger.info(
      { token: token ? token.slice(0, 4) + '...' : 'undefined', decision, userId: req.user?.id },
      'Processing referee invite decision',
    );

    let inviteResult;
    if (decision === 'accept') {
      if (!req.user) {
        logger.warn({ decision }, 'Accept decision requires authentication, but user is not authenticated.');
        return sendError(res, 'Authentication is required to accept this invitation.', 401);
      }
      inviteResult = await JournalRefereeManagementService.acceptRefereeInvite({ inviteToken: token, userId: user.id });
    } else {
      // decision === 'decline'
      inviteResult = await JournalRefereeManagementService.declineRefereeInvite({
        inviteToken: token,
        userId: user?.id,
      });
    }

    if (inviteResult.isErr()) {
      const error = inviteResult.error;
      logger.error({ error, body: req.body, userId: req.user?.id }, 'Failed to process referee invite decision');
      if (error.message === 'Referee invite not found' || error.message === 'Referee invite not valid') {
        return sendError(res, error.message, 400);
      }
      if (error.message === 'Maximum number of referees already assigned') {
        return sendError(res, error.message, 409);
      }
      return sendError(res, 'Failed to process referee invite decision', 500);
    }

    const invite = inviteResult.value;

    return sendSuccess(
      res,
      { invite: _.pick(invite, ['id', 'userId', 'submissionId', 'relativeDueDateHrs']) },
      `Referee invitation ${decision === 'accept' ? 'accepted' : 'declined'} successfully.`,
    );
  } catch (error) {
    logger.error(
      { error, body: req.body, params: req.params, userId: req.user?.id },
      'Unhandled error in refereeInviteDecisionController',
    );
    return sendError(res, 'An unexpected error occurred while processing your request.', 500);
  }
};
