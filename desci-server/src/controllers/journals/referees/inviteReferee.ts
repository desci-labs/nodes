import { id } from 'ethers/lib/utils.js';
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
    const { refereeUserId, refereeName, refereeEmail, relativeDueDateHrs, inviteExpiryHours, expectedFormTemplateIds } =
      req.validatedData.body;
    const managerUserId = req.user.id;

    logger.info(
      { submissionId, refereeUserId, managerUserId, relativeDueDateHrs, inviteExpiryHours, expectedFormTemplateIds },
      'Attempting to invite referee',
    );

    const result = await JournalRefereeManagementService.inviteReferee({
      submissionId: parseInt(submissionId),
      refereeName,
      refereeEmail,
      refereeUserId,
      managerUserId,
      relativeDueDateHrs,
      inviteExpiryHours,
      expectedFormTemplateIds,
    });

    if (result.isErr()) {
      const error = result.error;
      logger.error({ error, body: req.body, params: req.params, user: req.user }, 'Failed to invite referee');

      // Handle specific controlled errors with appropriate HTTP status codes
      if (error.message === 'Submission not found') {
        return sendError(res, error.message, 404);
      }
      if (error.message === 'Editor not found for submission') {
        return sendError(res, error.message, 403);
      }
      if (error.message === 'Referee email is required') {
        return sendError(res, error.message, 400);
      }
      if (error.message === 'One or more form templates are invalid or inactive') {
        return sendError(res, error.message, 400);
      }
      if (error.message.includes('Review due date must be between')) {
        return sendError(res, error.message, 400);
      }
      if (error.message.includes('Invite expiry must be between')) {
        return sendError(res, error.message, 400);
      }

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
  const { id: refereeUserId, email: refereeEmail } = req.user;

  const result = await JournalRefereeManagementService.getRefereeInvites(refereeUserId, refereeEmail);

  if (result.isErr()) {
    const error = result.error;
    logger.error({ error, refereeUserId }, 'Failed to get referee invites');
    return sendError(res, 'Failed to retrieve referee invitations', 500);
  }

  const invites = result.value;
  return sendSuccess(res, invites);
};
