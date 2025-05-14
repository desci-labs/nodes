import { EditorRole } from '@prisma/client';
import { Router } from 'express';

import { inviteEditor } from '../../../controllers/journals/invites/inviteEditor.js';
import { ensureJournalRole } from '../../../middleware/journalPermissions.js';
import { ensureUser } from '../../../middleware/permissions.js';

const router = Router();

router.post(
  '/journals/:journalId/invites/editor',
  [ensureUser, ensureJournalRole(EditorRole.CHIEF_EDITOR)],
  inviteEditor,
);

export default router;
