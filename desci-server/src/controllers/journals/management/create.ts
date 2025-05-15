import { NextFunction, Response } from 'express';
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

    const journal = await JournalManagementService.createJournal({
      name,
      description,
      iconCid,
      ownerId,
    });

    return sendSuccess(res, { journal }, 'Journal created successfully.');
  } catch (error) {
    if (error instanceof z.ZodError) {
      logger.warn({ error }, 'Validation failed for journal creation');
      const formattedErrors = Object.entries(error.flatten().fieldErrors).flatMap(([field, messages]) =>
        (messages || []).map((message) => ({ field, message })),
      );
      return sendError(res, 'Validation failed', formattedErrors, 400);
    }
    logger.error({ error, body: req.body, user: req.user }, 'Failed to create journal');
    return sendError(res, 'Failed to create journal', undefined, 500);
  }
};
