import { Router } from 'express';

import { logUserAction } from '../../controllers/log/index.js';
import { attachUser } from '../../middleware/attachUser.js';

const router = Router();

router.post('/action', [attachUser], logUserAction);

export default router;
