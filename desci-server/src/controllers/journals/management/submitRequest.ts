import { Response } from 'express';
import _ from 'lodash';

import { sendError, sendSuccess } from '../../../core/api.js';
import { AuthenticatedRequest, ValidatedRequest } from '../../../core/types.js';
import { logger as parentLogger } from '../../../logger.js';
import { journalApplicationSchema } from '../../../schemas/journals.schema.js';
import { JournalManagementService } from '../../../services/journals/JournalManagementService.js';

const logger = parentLogger.child({
  module: 'Journals::ApplyForJournalController',
});

type ApplyForJournalRequest = ValidatedRequest<typeof journalApplicationSchema, AuthenticatedRequest>;

export const applyForJournalController = async (req: ApplyForJournalRequest, res: Response) => {
  try {
    const { name, description, iconCid, editorialBoard, instructionsForAuthors, instructionsForReviewers } =
      req.validatedData.body;
    const applicantId = req.user.id;

    logger.info({ name, applicantId }, 'Attempting to submit journal application');

    const result = await JournalManagementService.applyForJournal({
      name,
      description,
      iconCid,
      editorialBoard: (editorialBoard ?? []).map((member) => ({
        name: member.name ?? '',
        email: member.email ?? '',
        role: member.role ?? '',
      })),
      instructionsForAuthors,
      instructionsForReviewers,
      applicantId,
    });

    if (result.isErr()) {
      const error = result.error;
      logger.error({ error, body: req.body, user: req.user }, 'Failed to submit journal application');
      return sendError(res, 'Failed to submit journal application due to a server error.', 500);
    }

    const application = _.pick(result.value, ['id', 'name', 'status', 'createdAt']);
    return sendSuccess(res, { application }, 'Journal application submitted successfully.');
  } catch (error) {
    logger.error({ error, body: req.body, user: req.user }, 'Unhandled error in applyForJournalController');
    return sendError(res, 'An unexpected error occurred while processing your request.', 500);
  }
};
