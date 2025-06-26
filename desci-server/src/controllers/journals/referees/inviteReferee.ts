import { Response } from 'express';
import _ from 'lodash';

import { sendError, sendSuccess } from '../../../core/api.js';
import { AuthenticatedRequest, ValidatedRequest } from '../../../core/types.js';
import { logger as parentLogger } from '../../../logger.js';
import { inviteRefereeSchema } from '../../../schemas/journals.schema.js';
import { JournalRefereeManagementService } from '../../../services/journals/JournalRefereeManagementService.js';

const logger = parentLogger.child({
  module: 'Journals::InviteRefereeController',
});

type InviteRefereeRequest = ValidatedRequest<typeof inviteRefereeSchema, AuthenticatedRequest>;

export const inviteRefereeController = async (req: InviteRefereeRequest, res: Response) => {
  try {
    const { submissionId } = req.validatedData.params;
    const { refereeUserId, relativeDueDateHrs } = req.validatedData.body;
    const managerUserId = req.user.id;

    logger.info({ submissionId, refereeUserId, managerUserId, relativeDueDateHrs }, 'Attempting to invite referee');

    const result = await JournalRefereeManagementService.inviteReferee({
      submissionId: parseInt(submissionId),
      refereeUserId,
      managerUserId,
      relativeDueDateHrs,
    });

    if (result.isErr()) {
      const error = result.error;
      logger.error({ error, body: req.body, params: req.params, user: req.user }, 'Failed to invite referee');
      return sendError(res, 'Failed to invite referee due to a server error.', 500);
    }

    const invite = result.value;
    return sendSuccess(
      res,
      { invite: _.pick(invite, ['id', 'userId', 'submissionId', 'relativeDueDateHrs']) },
      'Referee invited successfully.',
    );
  } catch (error) {
    logger.error(
      { error, body: req.body, params: req.params, user: req.user },
      'Unhandled error in inviteRefereeController',
    );
    return sendError(res, 'An unexpected error occurred', 500);
  }
};

export const getRefereeInvitesController = async (req: AuthenticatedRequest, res: Response) => {
  const refereeUserId = req.user.id;

  logger.info({ refereeUserId }, 'Attempting to get referee invites');

  const result = await JournalRefereeManagementService.getRefereeInvites(refereeUserId);

  if (result.isErr()) {
    const error = result.error;
    logger.error({ error, refereeUserId }, 'Failed to get referee invites');
    return sendError(res, null, 500);
  }

  const invites = result.value;
  logger.trace({ invites }, 'Invites');
  return sendSuccess(res, invites);
};
