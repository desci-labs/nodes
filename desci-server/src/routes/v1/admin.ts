import { Router } from 'express';

import { createCsv, getAnalytics } from '../../controllers/admin/analytics.js';
import { listDoiRecords } from '../../internal.js';
import { ensureAdmin } from '../../middleware/ensureAdmin.js';
import { ensureUser } from '../../middleware/permissions.js';

const router = Router();

router.get('/analytics', [ensureUser, ensureAdmin], getAnalytics);
router.get('/analytics/csv', [ensureUser, ensureAdmin], createCsv);
router.get('/doi/list', [ensureUser, ensureAdmin], listDoiRecords);

export default router;
