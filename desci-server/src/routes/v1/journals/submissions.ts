import { EditorRole } from '@prisma/client';
import { Router } from 'express';

import {
  assignSubmissionToEditorController,
  createJournalSubmissionController,
  getAuthorSubmissionsController,
  listJournalSubmissionsController,
  rejectSubmissionController,
  acceptSubmissionController,
  requestRevisionController,
  getJournalSubmissionController,
  getRefereeInvitationsBySubmissionController,
} from '../../../controllers/journals/submissions/index.js';
import { ensureJournalRole } from '../../../middleware/journalPermissions.js';
import { ensureUser } from '../../../middleware/permissions.js';
import { validateInputs } from '../../../middleware/validator.js';
import {
  assignSubmissionToEditorSchema,
  createJournalSubmissionSchema,
  getAuthorJournalSubmissionsSchema,
  listJournalSubmissionsSchema,
  rejectSubmissionSchema,
  requestRevisionSchema,
  reviewsApiSchema,
  submissionApiSchema,
} from '../../../schemas/journals.schema.js';
import { asyncHandler } from '../../../utils/asyncHandler.js';

export default function submissionRoutes(router: Router) {
  // Submissions
  router.post(
    '/:journalId/submissions',
    [ensureUser, validateInputs(createJournalSubmissionSchema)],
    asyncHandler(createJournalSubmissionController),
  );

  router.post(
    '/:journalId/submissions/:submissionId/assign',
    [ensureUser, ensureJournalRole(EditorRole.CHIEF_EDITOR), validateInputs(assignSubmissionToEditorSchema)],
    asyncHandler(assignSubmissionToEditorController),
  );

  router.get(
    '/:journalId/submissions',
    [ensureUser, validateInputs(listJournalSubmissionsSchema)],
    asyncHandler(listJournalSubmissionsController),
  );

  router.get(
    '/:journalId/submissions/:submissionId',
    [ensureUser, validateInputs(submissionApiSchema)],
    asyncHandler(getJournalSubmissionController),
  );

  router.get(
    '/:journalId/my-submissions',
    [ensureUser, validateInputs(getAuthorJournalSubmissionsSchema)],
    asyncHandler(getAuthorSubmissionsController),
  );

  // submission action routes
  router.post(
    '/:journalId/submissions/:submissionId/request-revision',
    [
      ensureUser,
      ensureJournalRole([EditorRole.ASSOCIATE_EDITOR, EditorRole.CHIEF_EDITOR]),
      validateInputs(requestRevisionSchema),
    ],
    asyncHandler(requestRevisionController),
  );

  router.post(
    '/:journalId/submissions/:submissionId/accept',
    [
      ensureUser,
      ensureJournalRole([EditorRole.ASSOCIATE_EDITOR, EditorRole.CHIEF_EDITOR]),
      validateInputs(submissionApiSchema),
    ],
    asyncHandler(acceptSubmissionController),
  );

  router.post(
    '/:journalId/submissions/:submissionId/reject',
    [
      ensureUser,
      ensureJournalRole([EditorRole.ASSOCIATE_EDITOR, EditorRole.CHIEF_EDITOR]),
      validateInputs(rejectSubmissionSchema),
    ],
    asyncHandler(rejectSubmissionController),
  );

  router.get(
    '/:journalId/submissions/:submissionId/referee-invitations',
    [
      ensureUser,
      validateInputs(reviewsApiSchema),
      ensureJournalRole([EditorRole.ASSOCIATE_EDITOR, EditorRole.CHIEF_EDITOR]),
    ],
    asyncHandler(getRefereeInvitationsBySubmissionController),
  );
}
