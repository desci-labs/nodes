import { Response } from 'express';
import { z } from 'zod';

import { sendError, sendSuccess } from '../../../core/api.js';
import { AuthenticatedRequest } from '../../../core/types.js';
import { logger as parentLogger } from '../../../logger.js';
import { JournalManagementService } from '../../../services/journals/JournalManagementService.js';

const logger = parentLogger.child({
  module: 'Journals::UpdateJournalController',
});

const UpdateJournalParamsSchema = z.object({
  journalId: z.string().transform((val) => parseInt(val, 10)),
});

const UpdateJournalRequestBodySchema = z.object({
  name: z.string().min(1, 'Journal name cannot be empty.').optional(),
  description: z.string().optional(),
  iconCid: z.string().optional(),
});

interface UpdateJournalRequest
  extends AuthenticatedRequest<
    z.input<typeof UpdateJournalParamsSchema>,
    any,
    z.input<typeof UpdateJournalRequestBodySchema>,
    any
  > {}

export const updateJournalController = async (req: UpdateJournalRequest, res: Response) => {
  try {
    const { journalId } = UpdateJournalParamsSchema.parse(req.params);
    const updateData = UpdateJournalRequestBodySchema.parse(req.body);
    const userId = req.user.id;

    if (Object.keys(updateData).length === 0) {
      return sendError(res, 'No update data provided.', undefined, 400);
    }

    logger.info({ journalId, userId, updateData }, 'Attempting to update journal');

    const result = await JournalManagementService.updateJournal(journalId, userId, updateData);

    if (result.isErr()) {
      const error = result.error;
      logger.error({ error, journalId, userId, body: req.body }, 'Failed to update journal');

      if (error.message === 'Journal not found.') {
        return sendError(res, 'Journal not found.', [{ field: 'journalId', message: error.message }], 404);
      }
      if (error.message && error.message.toLowerCase().includes('unique constraint failed')) {
        return sendError(
          res,
          'Failed to update journal due to a conflict. The name might already be in use.',
          [{ field: 'name', message: 'This name might already be taken by another journal.' }],
          409,
        );
      }

      return sendError(
        res,
        'Failed to update journal due to a server error.',
        [{ field: 'SYSTEM', message: error.message }],
        500,
      );
    }

    const updatedJournal = result.value;
    return sendSuccess(res, { journal: updatedJournal }, 'Journal updated successfully.');
  } catch (error) {
    if (error instanceof z.ZodError) {
      logger.warn(
        { errorDetails: error.flatten(), params: req.params, body: req.body },
        'Validation failed for journal update request',
      );
      const formattedErrors = Object.entries(error.flatten().fieldErrors).flatMap(([field, messages]) =>
        (messages || []).map((message) => ({ field, message })),
      );
      return sendError(res, 'Validation failed', formattedErrors, 400);
    }

    logger.error(
      { error, journalId: req.params?.journalId, userId: req.user?.id, body: req.body },
      'Failed to update journal',
    );
    return sendError(res, 'Failed to update journal', undefined, 500);
  }
};
