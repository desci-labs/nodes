import { Router } from 'express';

import { getFeatureStatus } from '../../../controllers/internal/getFeatureStatus.js';
import { postFeatureUsage } from '../../../controllers/internal/postFeatureUsage.js';
import { ensureInternalSecret } from '../../../middleware/internalSecret.js';
import { validateInputs } from '../../../middleware/validator.js';
import { getFeatureStatusSchema, postFeatureUsageSchema } from '../../../schemas/internal.schema.js';

const router = Router();

// Temp proxy routes whilst db is walled off to the current k8s cluster
// For services outside of the backend k8s cluster
router.get('/feature-limits/status', [ensureInternalSecret, validateInputs(getFeatureStatusSchema)], getFeatureStatus);
router.post(
  '/meter/research-assistant',
  [ensureInternalSecret, validateInputs(postFeatureUsageSchema)],
  postFeatureUsage,
);

export default router;
