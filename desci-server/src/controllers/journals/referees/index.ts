import { Response } from 'express';

import { sendError, sendSuccess } from '../../../core/api.js';
import { AuthenticatedRequest, ValidatedRequest } from '../../../core/types.js';
import { logger as parentLogger } from '../../../logger.js';
import { JournalRefereeManagementService } from '../../../services/journals/JournalRefereeManagementService.js';

const logger = parentLogger.child({
  module: 'Journals::ListRefereeAssignmentsController',
});

type ListRefereeAssignmentsRequest = AuthenticatedRequest;

export const listRefereeAssignmentsController = async (req: ListRefereeAssignmentsRequest, res: Response) => {
  try {
    const refereeUserId = req.user.id;

    logger.info({ refereeUserId }, 'Attempting to list referee assignments');

    const result = await JournalRefereeManagementService.getRefereeAssignments(refereeUserId);

    if (result.isErr()) {
      const error = result.error;
      logger.error({ error, body: req.body, params: req.params, user: req.user }, 'Failed to list referee assignments');
      return sendError(res, 'Failed to list referee assignments due to a server error.', 500);
    }

    const assignments = result.value;
    return sendSuccess(res, assignments);
  } catch (error) {
    logger.error(
      { error, body: req.body, params: req.params, user: req.user },
      'Unhandled error in listRefereeAssignmentsController',
    );
    return sendError(res, 'An unexpected error occurred', 500);
  }
};
