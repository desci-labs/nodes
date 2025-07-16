import { EditorRole } from '@prisma/client';
import { Router } from 'express';

import { createJournalController } from '../../../controllers/journals/management/create.js';
import { updateJournalController } from '../../../controllers/journals/management/update.js';
import { updateEditorRoleController } from '../../../controllers/journals/management/updateRole.js';
import { ensureJournalRole } from '../../../middleware/journalPermissions.js';
import { ensureUser } from '../../../middleware/permissions.js';
import { validateInputs } from '../../../middleware/validator.js';
import { createJournalSchema, updateEditorRoleSchema, updateJournalSchema } from '../../../schemas/journals.schema.js';

export default function managementRoutes(router: Router) {
  // Management
  router.post('/', [ensureUser, validateInputs(createJournalSchema)], createJournalController);
  router.patch(
    '/:journalId',
    [ensureUser, ensureJournalRole(EditorRole.CHIEF_EDITOR), validateInputs(updateJournalSchema)],
    updateJournalController,
  );
  router.patch(
    '/:journalId/editors/:editorUserId/manage', // This route is for CHIEF_EDITORS to manage editors.
    [ensureUser, ensureJournalRole(EditorRole.CHIEF_EDITOR), validateInputs(updateEditorRoleSchema)],
    updateEditorRoleController,
  );
}
