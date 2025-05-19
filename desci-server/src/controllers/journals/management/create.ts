import { Response } from 'express';
import _ from 'lodash';
import { z } from 'zod';

import { sendError, sendSuccess } from '../../../core/api.js';
import { AuthenticatedRequest } from '../../../core/types.js';
import { logger as parentLogger } from '../../../logger.js';
import { JournalManagementService } from '../../../services/journals/JournalManagementService.js';
const logger = parentLogger.child({
  module: 'Journals::CreateJournalController',
});

const CreateJournalRequestBodySchema = z.object({
  name: z.string().min(1, 'Journal name cannot be empty.'),
  description: z.string().optional(),
  iconCid: z.string().optional(),
});

interface CreateJournalRequest
  extends AuthenticatedRequest<any, any, z.input<typeof CreateJournalRequestBodySchema>, any> {}

export const createJournalController = async (req: CreateJournalRequest, res: Response) => {
  try {
    const { name, description, iconCid } = CreateJournalRequestBodySchema.parse(req.body);
    const ownerId = req.user.id;

    logger.info({ name, ownerId, description, iconCid }, 'Attempting to create journal');

    const result = await JournalManagementService.createJournal({
      name,
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
          undefined,
          409,
        );
      }

      return sendError(
        res,
        'Failed to create journal due to a server error.',
        [{ field: 'SYSTEM', message: error.message }],
        500,
      );
    }

    const journal = _.pick(result.value, ['id', 'name', 'description', 'iconCid', 'createdAt']);
    return sendSuccess(res, { journal }, 'Journal created successfully.');
  } catch (error) {
    if (error instanceof z.ZodError) {
      logger.warn({ errorDetails: error.flatten() }, 'Validation failed for journal creation');
      const formattedErrors = Object.entries(error.flatten().fieldErrors).flatMap(([field, messages]) =>
        (messages || []).map((message) => ({ field, message })),
      );
      return sendError(res, 'Validation failed', formattedErrors, 400);
    }

    logger.error({ error, body: req.body, user: req.user }, 'Unhandled error in createJournalController');
    return sendError(res, 'An unexpected error occurred while processing your request.', undefined, 500);
  }
};
