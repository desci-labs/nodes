import { Router } from 'express';

import {
  approveJournalApplicationController,
  listJournalApplicationsController,
  rejectJournalApplicationController,
} from '../../../controllers/admin/journals/requests.js';
import { ensureAdmin } from '../../../middleware/ensureAdmin.js';
import { ensureUser } from '../../../middleware/permissions.js';
import { validateInputs } from '../../../middleware/validator.js';
import { journalApplicationActionSchema, listJournalApplicationsSchema } from '../../../schemas/journals.schema.js';
import { asyncHandler } from '../../../utils/asyncHandler.js';

const router = Router();

router.get(
  '/applications',
  [ensureUser, ensureAdmin, validateInputs(listJournalApplicationsSchema)],
  asyncHandler(listJournalApplicationsController),
);
router.patch(
  '/applications/:id/approve',
  [ensureUser, ensureAdmin, validateInputs(journalApplicationActionSchema)],
  asyncHandler(approveJournalApplicationController),
);
router.patch(
  '/applications/:id/reject',
  [ensureUser, ensureAdmin, validateInputs(journalApplicationActionSchema)],
  asyncHandler(rejectJournalApplicationController),
);

export default router;
