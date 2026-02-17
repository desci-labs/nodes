import { EditorRole } from '@prisma/client';
import { PrismaClient } from '@prisma/client';
import { Router } from 'express';
import multer from 'multer';

import { createJournalController } from '../../../controllers/journals/management/create.js';
import { applyForJournalController } from '../../../controllers/journals/management/submitRequest.js';
import { updateJournalController } from '../../../controllers/journals/management/update.js';
import { updateEditorRoleController } from '../../../controllers/journals/management/updateRole.js';
import { sendSuccess, sendError } from '../../../core/api.js';
import { attachUser } from '../../../middleware/attachUser.js';
import { ensureJournalRole } from '../../../middleware/journalPermissions.js';
import { ensureUser } from '../../../middleware/permissions.js';
import { validateInputs } from '../../../middleware/validator.js';
import {
  createJournalSchema,
  journalApplicationSchema,
  updateEditorRoleSchema,
  updateJournalSchema,
} from '../../../schemas/journals.schema.js';
import { addBufferToIpfs } from '../../../services/ipfs.js';
import { JournalManagementService } from '../../../services/journals/JournalManagementService.js';
import { asyncHandler } from '../../../utils/asyncHandler.js';

const prisma = new PrismaClient();

export default function managementRoutes(router: Router) {
  // Management
  router.post('/', [ensureUser, validateInputs(createJournalSchema)], createJournalController);
  router.post('/apply', [ensureUser, validateInputs(journalApplicationSchema)], applyForJournalController);
  router.post(
    '/upload-icon',
    [ensureUser, multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } }).single('file')],
    asyncHandler(async (req: any, res: any) => {
      if (!req.file) return sendError(res, 'No file provided.', 400);
      const result = await addBufferToIpfs(req.file.buffer, req.file.originalname);
      return sendSuccess(res, { cid: result.cid });
    }),
  );
  router.get(
    '/check-name',
    [attachUser],
    asyncHandler(async (req: any, res: any) => {
      const name = req.query.name as string;
      if (!name?.trim()) return sendError(res, 'Name is required.', 400);
      const existing = await prisma.journal.findFirst({
        where: { name: { equals: name.trim(), mode: 'insensitive' } },
        select: { id: true },
      });
      return sendSuccess(res, { available: !existing });
    }),
  );
  router.get(
    '/my-applications',
    [ensureUser],
    asyncHandler(async (req: any, res: any) => {
      const result = await JournalManagementService.getMyJournalApplications(req.user.id);
      if (result.isErr()) return sendError(res, 'Failed to fetch applications.', 500);
      return sendSuccess(res, { applications: result.value });
    }),
  );
  router.put(
    '/resubmit/:applicationId',
    [ensureUser, validateInputs(journalApplicationSchema)],
    asyncHandler(async (req: any, res: any) => {
      const applicationId = parseInt(req.params.applicationId, 10);
      if (isNaN(applicationId) || applicationId <= 0) {
        return sendError(res, 'Invalid application ID.', 400);
      }
      const { name, description, iconCid, editorialBoard, instructionsForAuthors, instructionsForReviewers } =
        req.validatedData.body;
      const result = await JournalManagementService.resubmitJournalApplication({
        applicationId,
        applicantId: req.user.id,
        name,
        description,
        iconCid,
        editorialBoard,
        instructionsForAuthors,
        instructionsForReviewers,
      });
      if (result.isErr()) {
        const error = result.error;
        if (error.message.includes('not found')) return sendError(res, error.message, 404);
        if (error.message.includes('only resubmit')) return sendError(res, error.message, 403);
        if (error.message.includes('Only rejected')) return sendError(res, error.message, 409);
        return sendError(res, 'Failed to resubmit application.', 500);
      }
      return sendSuccess(res, { application: result.value }, 'Application resubmitted successfully.');
    }),
  );
  router.patch(
    '/:journalId',
    [ensureUser, ensureJournalRole(EditorRole.CHIEF_EDITOR), validateInputs(updateJournalSchema)],
    updateJournalController,
  );
  router.patch(
    '/:journalId/editors/:editorUserId/manage', // This route is for CHIEF_EDITORS to manage editors.
    [ensureUser, ensureJournalRole(EditorRole.CHIEF_EDITOR), validateInputs(updateEditorRoleSchema)],
    updateEditorRoleController,
  );
}
