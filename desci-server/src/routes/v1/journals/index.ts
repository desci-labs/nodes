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
router.get('/', listJournalsController);
router.get('/:journalId', showJournalController);

// Invites
router.post('/:journalId/invites/editor', [ensureUser, ensureJournalRole(EditorRole.CHIEF_EDITOR)], inviteEditor);
router.post('/:journalId/invitation/editor', [attachUser], editorInviteDecision); // editor accept/deny route

// Management
router.post('/', [ensureUser], createJournalController);
router.put('/:journalId', [ensureUser, ensureJournalRole(EditorRole.CHIEF_EDITOR)], updateJournalController);
router.patch(
  '/:journalId/editors/:editorId',
  [ensureUser, ensureJournalRole(EditorRole.CHIEF_EDITOR)],
  updateEditorRoleController,
);
router.delete(
  '/:journalId/editors/:editorId',
  [ensureUser, ensureJournalRole(EditorRole.CHIEF_EDITOR)],
  removeEditorController,
);

export default router;
