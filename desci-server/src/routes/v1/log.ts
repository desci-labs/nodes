import { Router } from 'express';

import { logUserAction } from 'controllers/log/index';
import { ensureUserIfPresent } from 'middleware/ensureUserIfPresent';

const router = Router();

router.post('/action', [ensureUserIfPresent], logUserAction);

export default router;
