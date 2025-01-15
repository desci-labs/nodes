import { Router } from 'express';

import { createCsv, getAnalytics } from '../../../controllers/admin/analytics.js';
import { listAttestations } from '../../../controllers/admin/communities/index.js';
import { debugAllNodesHandler, debugNodeHandler } from '../../../controllers/admin/debug.js';
import { listDoiRecords, mintDoi } from '../../../controllers/admin/doi/index.js';
import { resumePublish } from '../../../controllers/admin/publish/resumePublish.js';
import { ensureAdmin, ensureUserIsAdmin } from '../../../middleware/ensureAdmin.js';
import { ensureUser } from '../../../middleware/permissions.js';
import { asyncHandler } from '../../../utils/asyncHandler.js';

import communities from './communities/index.js';
import doiRouter from './doi.js';
import usersRouter from './users/index.js';

const router = Router();

router.get('/analytics', [ensureUser, ensureUserIsAdmin], getAnalytics);
router.get('/analytics/csv', [ensureUser, ensureUserIsAdmin], createCsv);

router.get('/doi/list', [ensureUser, ensureAdmin], listDoiRecords);
router.post('/mint/:uuid', [ensureUser, ensureAdmin], asyncHandler(mintDoi));

router.get('/debug', [ensureUser, ensureAdmin], asyncHandler(debugAllNodesHandler));
router.get('/debug/:uuid', [ensureUser, ensureAdmin], asyncHandler(debugNodeHandler));

router.post('/resumePublish', [ensureUser, ensureAdmin], asyncHandler(resumePublish));

router.use('/communities', [ensureUser, ensureAdmin], communities);
router.get('/attestations', [ensureUser, ensureAdmin], asyncHandler(listAttestations));
router.use('/users', [ensureUser, ensureAdmin], usersRouter);
// router.use('/nodes', [ensureUser, ensureAdmin], usersRouter);

router.use('/doi', doiRouter);
// router.use('/users', usersRouter);

export default router;
