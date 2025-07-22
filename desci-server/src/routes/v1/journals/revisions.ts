import { EditorRole } from '@prisma/client';
import { Router } from 'express';

import {
  getRevisionByIdController,
  getRevisionsController,
  revisionActionController,
  submitRevisionController,
} from '../../../controllers/journals/revision/index.js';
import { ensureJournalRole } from '../../../middleware/journalPermissions.js';
import { ensureUser } from '../../../middleware/permissions.js';
import { validateInputs } from '../../../middleware/validator.js';
import {
  revisionActionSchema,
  revisionApiSchema,
  submissionApiSchema,
  submitRevisionSchema,
} from '../../../schemas/journals.schema.js';
import { asyncHandler } from '../../../utils/asyncHandler.js';

export default function revisionRoutes(router: Router) {
  // Journal revision routes
  router.post(
    '/:journalId/submissions/:submissionId/revisions',
    [ensureUser, validateInputs(submitRevisionSchema)],
    asyncHandler(submitRevisionController),
  );
  router.get(
    '/:journalId/submissions/:submissionId/revisions',
    [ensureUser, validateInputs(submissionApiSchema)],
    asyncHandler(getRevisionsController),
  );

  router.get(
    '/:journalId/submissions/:submissionId/revisions/:revisionId',
    [ensureUser, validateInputs(revisionApiSchema)],
    asyncHandler(getRevisionByIdController),
  );

  router.post(
    '/:journalId/submissions/:submissionId/revisions/:revisionId/action',
    [ensureUser, ensureJournalRole(EditorRole.ASSOCIATE_EDITOR), validateInputs(revisionActionSchema)],
    asyncHandler(revisionActionController),
  );
}
