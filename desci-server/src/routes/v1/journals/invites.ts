import { EditorRole } from '@prisma/client';
import { Router } from 'express';

import { editorInviteDecision } from '../../../controllers/journals/invites/editorInviteDecision.js';
import {
  inviteEditor,
  listJournalEditorialBoard,
  listJournalEditors,
} from '../../../controllers/journals/invites/inviteEditor.js';
import { attachUser } from '../../../middleware/attachUser.js';
import { ensureJournalRole } from '../../../middleware/journalPermissions.js';
import { ensureUser } from '../../../middleware/permissions.js';
import { validateInputs } from '../../../middleware/validator.js';
import {
  editorInviteDecisionSchema,
  inviteEditorSchema,
  listJournalEditorsSchema,
} from '../../../schemas/journals.schema.js';
import { asyncHandler } from '../../../utils/asyncHandler.js';

export default function invitesRoute(router: Router) {
  // Invites
  router.get(
    '/:journalId/editors',
    [ensureUser, validateInputs(listJournalEditorsSchema), ensureJournalRole(EditorRole.CHIEF_EDITOR)],
    asyncHandler(listJournalEditors),
  );
  router.get(
    '/:journalId/editorial-board',
    [
      ensureUser,
      validateInputs(listJournalEditorsSchema),
      ensureJournalRole([EditorRole.CHIEF_EDITOR, EditorRole.ASSOCIATE_EDITOR]),
    ],
    asyncHandler(listJournalEditorialBoard),
  );
  router.post(
    '/:journalId/invites/editor',
    [ensureUser, validateInputs(inviteEditorSchema), ensureJournalRole(EditorRole.CHIEF_EDITOR)],
    asyncHandler(inviteEditor),
  );
  router.post(
    '/:journalId/invitation/editor',
    [attachUser, validateInputs(editorInviteDecisionSchema)],
    asyncHandler(editorInviteDecision),
  ); // editor accept/deny route
}
