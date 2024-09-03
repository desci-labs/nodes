import { Router } from 'express';

import { ensureAdmin } from '../../middleware/ensureAdmin.js';
import { ensureUser } from '../../middleware/permissions.js';
import { createCsv, getAnalytics } from '../../controllers/admin/analytics.js';
import { debugAllNodesHandler, debugNodeHandler } from '../../controllers/admin/debug.js';

const router = Router();

router.get('/analytics', [ensureUser, ensureAdmin], getAnalytics);
router.get('/analytics/csv', [ensureUser, ensureAdmin], createCsv);

router.get('/debug', [ensureUser, ensureAdmin], debugAllNodesHandler);
router.get('/debug/:uuid', [ensureUser, ensureAdmin], debugNodeHandler);

export default router;
