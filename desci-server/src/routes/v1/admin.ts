import { Router } from 'express';

import { createCsv, getAnalytics } from '../../controllers/admin/analytics.js';
import { ensureAdmin } from '../../middleware/ensureAdmin.js';
import { ensureUser } from '../../middleware/permissions.js';

const router = Router();

router.get('/analytics', [ensureUser, ensureAdmin], getAnalytics);
router.get('/analytics/csv', [ensureUser, ensureAdmin], createCsv);

export default router;
