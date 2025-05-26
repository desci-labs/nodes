import { EditorRole } from '@prisma/client';
import { Router } from 'express';

import { editorInviteDecision } from '../../../controllers/journals/invites/editorInviteDecision.js';
import { inviteEditor } from '../../../controllers/journals/invites/inviteEditor.js';
import { listJournalsController } from '../../../controllers/journals/list.js';
import { createJournalController } from '../../../controllers/journals/management/create.js';
import { removeEditorController } from '../../../controllers/journals/management/removeEditor.js';
import { updateJournalController } from '../../../controllers/journals/management/update.js';
import { updateEditorRoleController } from '../../../controllers/journals/management/updateRole.js';
import { showJournalController } from '../../../controllers/journals/show.js';
import {
  assignSubmissionToEditorController,
  createJournalSubmissionController,
  getAuthorSubmissionsController,
  listJournalSubmissionsController,
} from '../../../controllers/journals/submissions/index.js';
import { attachUser } from '../../../middleware/attachUser.js';
import { ensureJournalRole } from '../../../middleware/journalPermissions.js';
import { ensureUser } from '../../../middleware/permissions.js';
import { validateInputs } from '../../../middleware/validator.js';
import {
  assignSubmissionToEditorSchema,
  createJournalSchema,
  createJournalSubmissionSchema,
  editorInviteDecisionSchema,
  getAuthorJournalSubmissionsSchema,
  getJournalSchema,
  inviteEditorSchema,
  listJournalSubmissionsSchema,
  removeEditorSchema,
  updateEditorRoleSchema,
  updateJournalSchema,
} from '../../../schemas/journals.schema.js';
import { asyncHandler } from '../../../utils/asyncHandler.js';

const router = Router();

// General
router.get('/', listJournalsController);
router.get('/:journalId', [attachUser, validateInputs(getJournalSchema)], showJournalController);

// Invites
router.post(
  '/:journalId/invites/editor',
  [ensureUser, validateInputs(inviteEditorSchema), ensureJournalRole(EditorRole.CHIEF_EDITOR)],
  inviteEditor,
);
router.post(
  '/:journalId/invitation/editor',
  [attachUser, validateInputs(editorInviteDecisionSchema)],
  editorInviteDecision,
); // editor accept/deny route

// Management
router.post('/', [ensureUser, validateInputs(createJournalSchema)], createJournalController);
router.patch(
  '/:journalId',
  [ensureUser, ensureJournalRole(EditorRole.CHIEF_EDITOR), validateInputs(updateJournalSchema)],
  updateJournalController,
);
router.patch(
  '/:journalId/editors/:editorId',
  [ensureUser, ensureJournalRole(EditorRole.CHIEF_EDITOR), validateInputs(updateEditorRoleSchema)],
  updateEditorRoleController,
);
router.delete(
  '/:journalId/editors/:editorId',
  [ensureUser, ensureJournalRole(EditorRole.CHIEF_EDITOR), validateInputs(removeEditorSchema)],
  removeEditorController,
);

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
  '/:journalId/my-submissions/:authorId',
  [ensureUser, validateInputs(getAuthorJournalSubmissionsSchema)],
  asyncHandler(getAuthorSubmissionsController),
);
export default router;
