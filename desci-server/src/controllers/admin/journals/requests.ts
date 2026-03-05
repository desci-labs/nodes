import { Response } from 'express';

import { sendError, sendSuccess } from '../../../core/api.js';
import { AuthenticatedRequest, ValidatedRequest } from '../../../core/types.js';
import { logger as parentLogger } from '../../../logger.js';
import { journalApplicationActionSchema, listJournalApplicationsSchema } from '../../../schemas/journals.schema.js';
import { JournalManagementService } from '../../../services/journals/JournalManagementService.js';

const logger = parentLogger.child({
  module: 'Admin::JournalApplicationsController',
});

type ListJournalApplicationsRequest = ValidatedRequest<typeof listJournalApplicationsSchema, AuthenticatedRequest>;

export const listJournalApplicationsController = async (req: ListJournalApplicationsRequest, res: Response) => {
  try {
    const { status } = req.validatedData.query;

    logger.info({ status }, 'Listing journal applications');

    const result = await JournalManagementService.listJournalApplications(status);

    if (result.isErr()) {
      logger.error({ error: result.error }, 'Failed to list journal applications');
      return sendError(res, 'Failed to list journal applications.', 500);
    }

    return sendSuccess(res, { applications: result.value });
  } catch (error) {
    logger.error({ error }, 'Unhandled error in listJournalApplicationsController');
    return sendError(res, 'An unexpected error occurred.', 500);
  }
};

type JournalApplicationActionRequest = ValidatedRequest<typeof journalApplicationActionSchema, AuthenticatedRequest>;

export const approveJournalApplicationController = async (req: JournalApplicationActionRequest, res: Response) => {
  try {
    const { id } = req.validatedData.params;
    const adminUserId = req.user.id;

    logger.info({ applicationId: id, adminUserId }, 'Attempting to approve journal application');

    const result = await JournalManagementService.approveJournalApplication(id, adminUserId);

    if (result.isErr()) {
      const error = result.error;
      logger.error({ error, applicationId: id, adminUserId }, 'Failed to approve journal application');

      if (error.message.includes('not found')) {
        return sendError(res, error.message, 404);
      }
      if (error.message.includes('already been')) {
        return sendError(res, error.message, 409);
      }

      return sendError(res, 'Failed to approve journal application.', 500);
    }

    return sendSuccess(res, { journal: result.value }, 'Journal application approved successfully.');
  } catch (error) {
    logger.error({ error }, 'Unhandled error in approveJournalApplicationController');
    return sendError(res, 'An unexpected error occurred.', 500);
  }
};

export const rejectJournalApplicationController = async (req: JournalApplicationActionRequest, res: Response) => {
  try {
    const { id } = req.validatedData.params;
    const adminUserId = req.user.id;

    logger.info({ applicationId: id, adminUserId }, 'Attempting to reject journal application');

    const result = await JournalManagementService.rejectJournalApplication(id, adminUserId);

    if (result.isErr()) {
      const error = result.error;
      logger.error({ error, applicationId: id, adminUserId }, 'Failed to reject journal application');

      if (error.message.includes('not found')) {
        return sendError(res, error.message, 404);
      }
      if (error.message.includes('already been')) {
        return sendError(res, error.message, 409);
      }

      return sendError(res, 'Failed to reject journal application.', 500);
    }

    return sendSuccess(res, { application: result.value }, 'Journal application rejected successfully.');
  } catch (error) {
    logger.error({ error }, 'Unhandled error in rejectJournalApplicationController');
    return sendError(res, 'An unexpected error occurred.', 500);
  }
};
