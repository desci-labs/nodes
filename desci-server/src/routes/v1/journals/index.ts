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
import { attachUser } from '../../../middleware/attachUser.js';
import { ensureJournalRole } from '../../../middleware/journalPermissions.js';
import { ensureUser } from '../../../middleware/permissions.js';
import { validateInputs } from '../../../middleware/validator.js';
import {
  createJournalSchema,
  editorInviteDecisionSchema,
  getJournalSchema,
  inviteEditorSchema,
  removeEditorSchema,
  updateEditorRoleSchema,
  updateJournalSchema,
} from '../../../schemas/journals.schema.js';

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
  [attachUser, validateInputs(editorInviteDecisionSchema), ensureJournalRole(EditorRole.CHIEF_EDITOR)],
  editorInviteDecision,
); // editor accept/deny route

// Management
router.post('/', [ensureUser, validateInputs(createJournalSchema)], createJournalController);
router.put('/:journalId', [ensureUser, ensureJournalRole(EditorRole.CHIEF_EDITOR)], updateJournalController);
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

export default router;
