import { Router } from 'express';

import { getFeatureAdoptionMetrics } from '../../../../controllers/admin/metrics/featureAdoptionMetrics.js';
import { getPublishMetrics } from '../../../../controllers/admin/metrics/publishMetrics.js';
import { getResearchObjectMetrics } from '../../../../controllers/admin/metrics/researchObjectMetrics.js';
import { getRetentionMetrics } from '../../../../controllers/admin/metrics/retentionMetrics.js';
import { getUserEngagementMetrics } from '../../../../controllers/admin/metrics/userEngagements.js';
import { metricsApiSchema } from '../../../../controllers/admin/schema.js';
import { ensureUserIsAdmin } from '../../../../middleware/ensureAdmin.js';
import { ensureUser } from '../../../../middleware/index.js';
import { validateInputs } from '../../../../middleware/validator.js';
import { asyncHandler } from '../../../../utils/asyncHandler.js';

const router = Router();

router.get('/user-engagements', [ensureUser, ensureUserIsAdmin], asyncHandler(getUserEngagementMetrics));
router.get(
  '/publish-metrics',
  [ensureUser, ensureUserIsAdmin, validateInputs(metricsApiSchema)],
  asyncHandler(getPublishMetrics),
);
router.get(
  '/research-object-metrics',
  [ensureUser, ensureUserIsAdmin, validateInputs(metricsApiSchema)],
  asyncHandler(getResearchObjectMetrics),
);
router.get('/retention-metrics', [ensureUser, ensureUserIsAdmin], asyncHandler(getRetentionMetrics));
router.get(
  '/feature-adoption-metrics',
  [ensureUser, ensureUserIsAdmin, validateInputs(metricsApiSchema)],
  asyncHandler(getFeatureAdoptionMetrics),
);

export default router;
