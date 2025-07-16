import { EditorRole } from '@prisma/client';
import { Router } from 'express';

import { createFormTemplateController } from '../../../controllers/journals/forms/createTemplate.js';
import { getFormResponseController } from '../../../controllers/journals/forms/getFormResponse.js';
import { getFormTemplateController } from '../../../controllers/journals/forms/getFormTemplate.js';
import { listFormTemplatesController } from '../../../controllers/journals/forms/listTemplates.js';
import { saveFormResponseController } from '../../../controllers/journals/forms/saveFormResponse.js';
import { submitFormResponseController } from '../../../controllers/journals/forms/submitFormResponse.js';
import { updateFormTemplateController } from '../../../controllers/journals/forms/updateTemplate.js';
import { getRefereeFormStatusController } from '../../../controllers/journals/referees/getRefereeFormStatus.js';
import { ensureJournalRole } from '../../../middleware/journalPermissions.js';
import { ensureUser } from '../../../middleware/permissions.js';
import { validateInputs } from '../../../middleware/validator.js';
import {
  createFormTemplateSchema,
  getFormResponseSchema,
  getFormTemplateSchema,
  listFormTemplatesSchema,
  submitFormResponseSchema,
  updateFormTemplateSchema,
} from '../../../schemas/journals.schema.js';
import { asyncHandler } from '../../../utils/asyncHandler.js';

export default function formsRoute(router: Router) {
  // Form Template Routes
  router.post(
    '/:journalId/forms/templates',
    [ensureUser, ensureJournalRole(EditorRole.CHIEF_EDITOR), validateInputs(createFormTemplateSchema)],
    asyncHandler(createFormTemplateController),
  );

  router.get(
    '/:journalId/forms/templates',
    [
      ensureUser,
      ensureJournalRole([EditorRole.ASSOCIATE_EDITOR, EditorRole.CHIEF_EDITOR]),
      validateInputs(listFormTemplatesSchema),
    ],
    asyncHandler(listFormTemplatesController),
  );

  router.get(
    '/:journalId/forms/templates/:templateId',
    [ensureUser, validateInputs(getFormTemplateSchema)],
    asyncHandler(getFormTemplateController),
  );

  router.patch(
    '/:journalId/forms/templates/:templateId',
    [ensureUser, ensureJournalRole(EditorRole.CHIEF_EDITOR), validateInputs(updateFormTemplateSchema)],
    asyncHandler(updateFormTemplateController),
  );

  // Form Response Routes (Referees)
  router.get(
    '/:journalId/forms/response/:assignmentId/:templateId',
    [ensureUser, validateInputs(getFormResponseSchema)],
    asyncHandler(getFormResponseController),
  );

  router.put('/:journalId/forms/response/:responseId', [ensureUser], asyncHandler(saveFormResponseController));

  router.post(
    '/:journalId/forms/response/:responseId/submit',
    [ensureUser, validateInputs(submitFormResponseSchema)],
    asyncHandler(submitFormResponseController),
  );

  // Referee form status
  router.get(
    '/:journalId/submissions/:submissionId/referees/assignments/:assignmentId/form-status',
    [ensureUser],
    asyncHandler(getRefereeFormStatusController),
  );
}
