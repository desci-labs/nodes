import { EditorRole } from '@prisma/client';
import { Router } from 'express';

import { showJournalAnalyticsController } from '../../../controllers/journals/dashboard/analytics.js';
import { showUrgentJournalSubmissionsController } from '../../../controllers/journals/dashboard/urgentSubmissions.js';
import {
  listFeaturedJournalPublicationsController,
  listFeaturedPublicationsController,
} from '../../../controllers/journals/featured.js';
import { listJournalsController } from '../../../controllers/journals/list.js';
import { viewJournalEditors } from '../../../controllers/journals/public.js';
import { showJournalController, showJournalProfileController } from '../../../controllers/journals/show.js';
import { attachUser } from '../../../middleware/attachUser.js';
import { ensureJournalRole } from '../../../middleware/journalPermissions.js';
import { ensureUser } from '../../../middleware/permissions.js';
import { validateInputs } from '../../../middleware/validator.js';
import {
  getJournalSchema,
  listJournalsSchema,
  getJournalAnalyticsSchema,
  showUrgentSubmissionsSchema,
  listFeaturedPublicationsSchema,
  listJournalEditorsSchema,
} from '../../../schemas/journals.schema.js';
import { asyncHandler } from '../../../utils/asyncHandler.js';

import formsRoute from './forms.js';
import invitesRoutes from './invites.js';
import managementRoutes from './management.js';
import refereesRoutes from './referees.js';
import reviewsRoutes from './reviews.js';
import revisionsRoutes from './revisions.js';
import settingsRoutes from './settings.js';
import submissionsRoutes from './submissions.js';

const router = Router();

// General
router.get('/', [attachUser, validateInputs(listJournalsSchema)], asyncHandler(listJournalsController));
router.get('/profile', [ensureUser], asyncHandler(showJournalProfileController));
router.get(
  '/featured',
  [attachUser, validateInputs(listFeaturedPublicationsSchema)],
  asyncHandler(listFeaturedPublicationsController),
);
router.get(
  '/:journalId',
  [
    ensureUser,
    ensureJournalRole([EditorRole.ASSOCIATE_EDITOR, EditorRole.CHIEF_EDITOR]),
    validateInputs(getJournalSchema),
  ],
  showJournalController,
);
router.get(
  '/:journalId/view-editors',
  [attachUser, validateInputs(listJournalEditorsSchema)],
  asyncHandler(viewJournalEditors),
);
router.get(
  '/:journalId/featured',
  [attachUser, validateInputs(listFeaturedPublicationsSchema)],
  asyncHandler(listFeaturedJournalPublicationsController),
);
// admin dashboard apis
router.get(
  '/:journalId/analytics',
  [
    ensureUser,
    ensureJournalRole([EditorRole.CHIEF_EDITOR, EditorRole.ASSOCIATE_EDITOR]),
    validateInputs(getJournalAnalyticsSchema),
  ],
  asyncHandler(showJournalAnalyticsController),
);

router.get(
  '/:journalId/urgentSubmissions',
  [
    ensureUser,
    ensureJournalRole([EditorRole.CHIEF_EDITOR, EditorRole.ASSOCIATE_EDITOR]),
    validateInputs(showUrgentSubmissionsSchema),
  ],
  asyncHandler(showUrgentJournalSubmissionsController),
);

invitesRoutes(router);
managementRoutes(router);
submissionsRoutes(router);
reviewsRoutes(router);
refereesRoutes(router);
revisionsRoutes(router);
settingsRoutes(router);
formsRoute(router);

export default router;
