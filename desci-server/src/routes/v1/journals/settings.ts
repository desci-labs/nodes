import { EditorRole } from '@prisma/client';
import { Router } from 'express';

import { getJournalSettingsController } from '../../../controllers/journals/management/getJournalSettings.js';
import { removeEditorController } from '../../../controllers/journals/management/removeEditor.js';
import { updateEditorController } from '../../../controllers/journals/management/updateEditor.js';
import { updateJournalSettingsController } from '../../../controllers/journals/management/updateJournalSettings.js';
import { ensureJournalRole } from '../../../middleware/journalPermissions.js';
import { ensureUser } from '../../../middleware/permissions.js';
import { validateInputs } from '../../../middleware/validator.js';
import {
  getJournalSettingsSchema,
  removeEditorSchema,
  updateEditorSchema,
  updateJournalSettingsSchema,
} from '../../../schemas/journals.schema.js';
import { asyncHandler } from '../../../utils/asyncHandler.js';

export default function settingsRoute(router: Router) {
  router.get(
    '/:journalId/settings',
    [
      ensureUser,
      ensureJournalRole([EditorRole.CHIEF_EDITOR, EditorRole.ASSOCIATE_EDITOR]),
      validateInputs(getJournalSettingsSchema),
    ],
    asyncHandler(getJournalSettingsController),
  );

  router.patch(
    '/:journalId/settings',
    [ensureUser, ensureJournalRole(EditorRole.CHIEF_EDITOR), validateInputs(updateJournalSettingsSchema)],
    asyncHandler(updateJournalSettingsController),
  );

  router.patch(
    '/:journalId/editors/:editorUserId/settings', // This route is for EDITORS to manage their own settings.
    [
      ensureUser,
      ensureJournalRole([EditorRole.ASSOCIATE_EDITOR, EditorRole.CHIEF_EDITOR]),
      validateInputs(updateEditorSchema),
    ],
    asyncHandler(updateEditorController),
  );

  router.delete(
    '/:journalId/editors/:editorUserId',
    [ensureUser, ensureJournalRole(EditorRole.CHIEF_EDITOR), validateInputs(removeEditorSchema)],
    asyncHandler(removeEditorController),
  );
}
