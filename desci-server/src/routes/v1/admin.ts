import { Router } from 'express';

import { getAnalytics } from 'controllers/admin';
import { ensureAdmin } from 'middleware/ensureAdmin';
import { ensureUser } from 'middleware/ensureUser';

const router = Router();

router.get('/analytics', [ensureUser, ensureAdmin], getAnalytics);

export default router;
