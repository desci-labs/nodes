import { Router } from 'express';

import { getUserEngagementMetrics } from '../../../../controllers/admin/metrics/userEngagements.js';
import { ensureUserIsAdmin } from '../../../../middleware/ensureAdmin.js';
import { ensureUser } from '../../../../middleware/index.js';
import { asyncHandler } from '../../../../utils/asyncHandler.js';

const router = Router();

router.get('/user-engagements', [ensureUser, ensureUserIsAdmin], asyncHandler(getUserEngagementMetrics));

export default router;
