import { Response } from 'express';
import _ from 'lodash';

import { sendError, sendSuccess } from '../../../core/api.js';
import { AuthenticatedRequest, ValidatedRequest } from '../../../core/types.js';
import { logger as parentLogger } from '../../../logger.js';
import { createJournalSchema } from '../../../schemas/journals.schema.js';
import { JournalManagementService } from '../../../services/journals/JournalManagementService.js';

const logger = parentLogger.child({
  module: 'Journals::CreateJournalController',
});

type CreateJournalRequest = ValidatedRequest<typeof createJournalSchema, AuthenticatedRequest>;

export const createJournalController = async (req: CreateJournalRequest, res: Response) => {
  try {
    const { name, slug, description, iconCid } = req.validatedData.body;
    const ownerId = req.user.id;

    logger.info({ name, ownerId, description, iconCid }, 'Attempting to create journal');

    const result = await JournalManagementService.createJournal({
      name,
      slug,
      description,
      iconCid,
      ownerId,
    });

    if (result.isErr()) {
      const error = result.error;
      logger.error({ error, body: req.body, user: req.user }, 'Failed to create journal');

      if (error.message && error.message.toLowerCase().includes('unique constraint failed')) {
        return sendError(
          res,
          'A journal with this name may already exist or another unique field constraint was violated.',
          409,
        );
      }

      return sendError(res, 'Failed to create journal due to a server error.', 500);
    }

    const journal = _.pick(result.value, ['id', 'name', 'description', 'iconCid', 'createdAt']);
    return sendSuccess(res, { journal }, 'Journal created successfully.');
  } catch (error) {
    logger.error({ error, body: req.body, user: req.user }, 'Unhandled error in createJournalController');
    return sendError(res, 'An unexpected error occurred while processing your request.', 500);
  }
};
