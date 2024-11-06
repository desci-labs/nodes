import { Router } from 'express';

import { createCsv, getAnalytics } from '../../../controllers/admin/analytics.js';
import { listAttestations } from '../../../controllers/admin/communities/index.js';
import { debugAllNodesHandler, debugNodeHandler } from '../../../controllers/admin/debug.js';
import { listDoiRecords } from '../../../controllers/doi/admin.js';
import { ensureAdmin } from '../../../middleware/ensureAdmin.js';
import { ensureUser } from '../../../middleware/permissions.js';
import { asyncHandler } from '../../../utils/asyncHandler.js';

import communities from './communities/index.js';
import doiRouter from './doi.js';
import usersRouter from './users/index.js';

const router = Router();

router.get('/analytics', [ensureUser, ensureAdmin], getAnalytics);
router.get('/analytics/csv', [ensureUser, ensureAdmin], createCsv);
router.get('/doi/list', [ensureUser, ensureAdmin], listDoiRecords);

router.get('/debug', [ensureUser, ensureAdmin], asyncHandler(debugAllNodesHandler));
router.get('/debug/:uuid', [ensureUser, ensureAdmin], asyncHandler(debugNodeHandler));

router.use('/communities', [ensureUser, ensureAdmin], communities);
router.get('/attestations', [ensureUser, ensureAdmin], asyncHandler(listAttestations));
// router.use('/users', [ensureUser, ensureAdmin], usersRouter);

router.use('/doi', doiRouter);

export default router;
