import { Response } from 'express';
import _ from 'lodash';

import { prisma } from '../../../client.js';
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
    const { refereeUserId, refereeEmail, relativeDueDateHrs, expectedFormTemplateIds } = req.validatedData.body;
    const managerUserId = req.user.id;

    logger.info(
      { submissionId, refereeUserId, managerUserId, relativeDueDateHrs, expectedFormTemplateIds },
      'Attempting to invite referee',
    );

    let invitedUserId = refereeUserId;
    if (!invitedUserId) {
      const refereeEmailIsExists = await prisma.user.findFirst({
        where: {
          email: refereeEmail,
        },
      });

      if (refereeEmailIsExists) {
        invitedUserId = refereeEmailIsExists.id;
      }
    }

    const result = await JournalRefereeManagementService.inviteReferee({
      submissionId: parseInt(submissionId),
      refereeEmail,
      refereeUserId: invitedUserId,
      managerUserId,
      relativeDueDateHrs,
      expectedFormTemplateIds,
    });

    if (result.isErr()) {
      const error = result.error;
      logger.error({ error, body: req.body, params: req.params, user: req.user }, 'Failed to invite referee');

      return sendError(res, error.message, 500);
    }

    const invite = result.value;
    return sendSuccess(
      res,
      {
        invite: _.pick(invite, [
          'id',
          'userId',
          'submissionId',
          'relativeDueDateHrs',
          'expectedFormTemplateIds',
          'email',
          'token',
          'invitedById',
          'createdAt',
          'expiresAt',
          'accepted',
          'declined',
        ]),
      },
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

  const result = await JournalRefereeManagementService.getRefereeInvites(refereeUserId);

  if (result.isErr()) {
    const error = result.error;
    logger.error({ error, refereeUserId }, 'Failed to get referee invites');
    return sendError(res, 'Failed to retrieve referee invitations', 500);
  }

  const invites = result.value;
  return sendSuccess(res, invites);
};
