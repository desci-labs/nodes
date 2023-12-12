import { createCsv, getAnalytics } from '../../controllers/admin/analytics.js';
import { Router } from 'express';
import { ensureAdmin } from '../../middleware/ensureAdmin.js';
import { ensureUser } from '../../middleware/ensureUser.js';

const router = Router();

router.get('/analytics', [ensureUser, ensureAdmin], getAnalytics);
router.get('/analytics/csv', [ensureUser, ensureAdmin], createCsv);

export default router;
