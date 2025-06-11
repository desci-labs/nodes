import { Router } from 'express';

import { getPublishMetrics } from '../../../../controllers/admin/metrics/publishMetrics.js';
import { getResearchObjectMetrics } from '../../../../controllers/admin/metrics/researchObjectMetrics.js';
import { getUserEngagementMetrics } from '../../../../controllers/admin/metrics/userEngagements.js';
import { metricsApiOptionalSchema, metricsApiSchema } from '../../../../controllers/admin/schema.js';
import { ensureUserIsAdmin } from '../../../../middleware/ensureAdmin.js';
import { ensureUser } from '../../../../middleware/index.js';
import { validateInputs } from '../../../../middleware/validator.js';
import { asyncHandler } from '../../../../utils/asyncHandler.js';

const router = Router();

router.get('/user-engagements', [ensureUser, ensureUserIsAdmin], asyncHandler(getUserEngagementMetrics));
router.get(
  '/publish-metrics',
  [ensureUser, ensureUserIsAdmin, validateInputs(metricsApiOptionalSchema)],
  asyncHandler(getPublishMetrics),
);
router.get(
  '/research-object-metrics',
  [ensureUser, ensureUserIsAdmin, validateInputs(metricsApiOptionalSchema)],
  asyncHandler(getResearchObjectMetrics),
);

export default router;
