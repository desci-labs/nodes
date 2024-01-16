import { Router } from 'express';

import { logUserAction } from '../../controllers/log/index.js';
import { ensureUserIfPresent } from '../../middleware/ensureUserIfPresent.js';

const router = Router();

router.post('/action', [ensureUserIfPresent], logUserAction);

export default router;
