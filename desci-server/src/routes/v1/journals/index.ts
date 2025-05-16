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

const router = Router();

// General
router.get('/journals', listJournalsController);
router.get('/journals/:journalId', showJournalController);

// Invites
router.post(
  '/journals/:journalId/invites/editor',
  [ensureUser, ensureJournalRole(EditorRole.CHIEF_EDITOR)],
  inviteEditor,
);
router.post('/journals/:journalId/invitation/editor', [attachUser], editorInviteDecision);

// Management
router.post('/journals', [ensureUser], createJournalController);
router.put('/journals/:journalId', [ensureUser, ensureJournalRole(EditorRole.CHIEF_EDITOR)], updateJournalController);
router.patch(
  '/journals/:journalId/editors/:editorId',
  [ensureUser, ensureJournalRole(EditorRole.CHIEF_EDITOR)],
  updateEditorRoleController,
);
router.delete(
  '/journals/:journalId/editors/:editorId',
  [ensureUser, ensureJournalRole(EditorRole.CHIEF_EDITOR)],
  removeEditorController,
);

export default router;
