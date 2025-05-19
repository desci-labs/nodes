import { NextFunction, Response } from 'express';
import { z } from 'zod';

import { sendError, sendSuccess } from '../../../core/api.js';
import { AuthenticatedRequest } from '../../../core/types.js';
import { logger as parentLogger } from '../../../logger.js';
import { JournalInviteService } from '../../../services/journals/JournalInviteService.js';

const logger = parentLogger.child({
  module: 'Journals::EditorInviteDecisionController',
});

const EditorInviteDecisionParamsSchema = z.object({
  token: z.string(),
});

const EditorInviteDecisionRequestBodySchema = z.object({
  decision: z.enum(['accept', 'decline']),
});

interface EditorInviteDecisionRequest
  extends AuthenticatedRequest<
    z.input<typeof EditorInviteDecisionParamsSchema>,
    any,
    z.input<typeof EditorInviteDecisionRequestBodySchema>,
    any
  > {}

export const editorInviteDecision = async (req: EditorInviteDecisionRequest, res: Response, next: NextFunction) => {
  try {
    const { token } = EditorInviteDecisionParamsSchema.parse(req.params);
    const { decision } = EditorInviteDecisionRequestBodySchema.parse(req.body);
    const user = req.user; // User can be undefined, declining doesn't require auth.

    logger.info({ token, decision, userId: req.user?.id }, 'Processing editor invite decision');

    let invite;
    if (decision === 'accept') {
      // For 'accept', user must be authenticated
      if (!req.user || !req.user.id) {
        logger.warn({ token, decision }, 'Accept decision requires authentication, but user is not authenticated.');
        return sendError(res, 'Authentication is required to accept this invitation.', undefined, 401);
      }
      invite = await JournalInviteService.acceptJournalInvite({ token, userId: user.id });
      return sendSuccess(res, { invite }, 'Editor invitation accepted successfully.');
    } else {
      // decision === 'decline'
      // For 'decline', user does not need to be authenticated
      invite = await JournalInviteService.declineJournalInvite({ token, userId: user?.id });
      return sendSuccess(res, { invite }, 'Editor invitation declined successfully.');
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      logger.warn({ error }, 'Validation failed for editor invite decision');
      const formattedErrors = Object.entries(error.flatten().fieldErrors).flatMap(([field, messages]) =>
        (messages || []).map((message) => ({ field, message })),
      );
      return sendError(res, 'Validation failed', formattedErrors, 400);
    }
    const errorLogDetails: any = { error, body: req.body, params: req.params };
    if (req.user) {
      errorLogDetails.user = req.user;
    }
    logger.error(errorLogDetails, 'Failed to process editor invite decision');

    if (error.message === 'Invite not found' || error.message === 'Invite expired') {
      return sendError(res, error.message, undefined, 400);
    }
    return sendError(res, 'Failed to process editor invite decision', undefined, 500);
  }
};
