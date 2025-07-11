import { Router } from 'express';

import {
  createCsv,
  getActiveOrcidUserAnalytics,
  getActiveUserAnalytics,
  getAnalytics,
  getAggregatedAnalytics,
  getNewOrcidUserAnalytics,
  getNewUserAnalytics,
  userAnalyticsSchema,
  getAggregatedAnalyticsCsv,
} from '../../../controllers/admin/analytics.js';
import { listAttestations } from '../../../controllers/admin/communities/index.js';
import { retryMigration } from '../../../controllers/admin/data/retryMigration.js';
import { debugAllNodesHandler, debugNodeHandler } from '../../../controllers/admin/debug.js';
import { listDoiRecords, mintDoi } from '../../../controllers/admin/doi/index.js';
import { resumePublish } from '../../../controllers/admin/publish/resumePublish.js';
import { analyticsChartSchema } from '../../../controllers/admin/schema.js';
import { ensureAdmin, ensureUserIsAdmin } from '../../../middleware/ensureAdmin.js';
import { ensureUser } from '../../../middleware/permissions.js';
import { validate } from '../../../middleware/validator.js';
import { asyncHandler } from '../../../utils/asyncHandler.js';

import communities from './communities/index.js';
import doiRouter from './doi.js';
import metricsRouter from './metrics/index.js';
import nodesRouter from './nodes.js';
import usersRouter from './users/index.js';

const router = Router();

router.get('/analytics', [ensureUser, ensureUserIsAdmin], getAnalytics);
router.get('/analytics/csv', [ensureUser, ensureUserIsAdmin], createCsv);
router.get(
  '/analytics/query',
  [validate(analyticsChartSchema), ensureUser, ensureUserIsAdmin],
  asyncHandler(getAggregatedAnalytics),
);
router.get(
  '/analytics/querycsv',
  [validate(analyticsChartSchema), ensureUser, ensureUserIsAdmin],
  asyncHandler(getAggregatedAnalyticsCsv),
);
router.get('/analytics/new-users', [validate(userAnalyticsSchema), ensureUser, ensureUserIsAdmin], getNewUserAnalytics);
// router.get(
//   '/analytics/new-orcid-users',
//   [validate(userAnalyticsSchema), ensureUser, ensureUserIsAdmin],
//   getNewOrcidUserAnalytics,
// );
router.get(
  '/analytics/active-users',
  [validate(userAnalyticsSchema), ensureUser, ensureUserIsAdmin],
  getActiveUserAnalytics,
);
// router.get(
//   '/analytics/active-orcid-users',
//   [validate(userAnalyticsSchema), ensureUser, ensureUserIsAdmin],
//   getActiveOrcidUserAnalytics,
// );

router.get('/doi/list', [ensureUser, ensureAdmin], listDoiRecords);
router.post('/mint/:uuid', [ensureUser, ensureAdmin], asyncHandler(mintDoi));

router.get('/debug', [ensureUser, ensureAdmin], asyncHandler(debugAllNodesHandler));
router.get('/debug/:uuid', [ensureUser, ensureAdmin], asyncHandler(debugNodeHandler));

router.post('/resumePublish', [ensureUser, ensureAdmin], asyncHandler(resumePublish));
router.post('/retryMigration/:migrationId', [ensureUser, ensureAdmin], asyncHandler(retryMigration));
router.use('/communities', [], communities);
router.get('/attestations', [ensureUser, ensureAdmin], asyncHandler(listAttestations));
router.use('/users', usersRouter);
// router.use('/nodes', [ensureUser, ensureAdmin], usersRouter);

router.use('/doi', doiRouter);
router.use('/nodes', nodesRouter);
router.use('/metrics', metricsRouter);
// router.use('/users', usersRouter);

export default router;
