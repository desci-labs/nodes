import { EditorRole } from '@prisma/client';
import { Router } from 'express';

import { editorInviteDecision } from '../../../controllers/journals/invites/editorInviteDecision.js';
import { inviteEditor } from '../../../controllers/journals/invites/inviteEditor.js';
import { createJournalController } from '../../../controllers/journals/management/create.js';
import { updateJournalController } from '../../../controllers/journals/management/update.js';
import { attachUser } from '../../../middleware/attachUser.js';
import { ensureJournalRole } from '../../../middleware/journalPermissions.js';
import { ensureUser } from '../../../middleware/permissions.js';

const router = Router();

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

export default router;
