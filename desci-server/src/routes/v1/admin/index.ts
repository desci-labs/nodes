import { Router } from 'express';

import { createCsv, getAnalytics } from '../../../controllers/admin/analytics.js';
import { debugAllNodesHandler, debugNodeHandler } from '../../../controllers/admin/debug.js';
// import { listDoiRecords } from '../../../internal.js';
import { listDoiRecords } from '../../../controllers/doi/admin.js';
import { ensureAdmin } from '../../../middleware/ensureAdmin.js';
import { ensureUser } from '../../../middleware/permissions.js';

import communities from './communities/index.js';

const router = Router();

router.get('/analytics', [ensureUser, ensureAdmin], getAnalytics);
router.get('/analytics/csv', [ensureUser, ensureAdmin], createCsv);
router.get('/doi/list', [ensureUser, ensureAdmin], listDoiRecords);

router.get('/debug', [ensureUser, ensureAdmin], debugAllNodesHandler);
router.get('/debug/:uuid', [ensureUser, ensureAdmin], debugNodeHandler);

router.use('/communities', [ensureUser, ensureAdmin], communities);

export default router;
