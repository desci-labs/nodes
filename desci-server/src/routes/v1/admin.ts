import { Router } from 'express';

import { createCsv, getAnalytics } from 'controllers/admin';
import { ensureAdmin } from 'middleware/ensureAdmin';
import { ensureUser } from 'middleware/ensureUser';

const router = Router();

router.get('/analytics', [ensureUser, ensureAdmin], getAnalytics);
router.get('/analytics/csv', [ensureUser, ensureAdmin], createCsv);

export default router;
