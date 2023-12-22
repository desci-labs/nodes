import { Router } from 'express';

import { add, list, promote } from '../../controllers/waitlist/index.js';
import { ensureAdmin } from '../../middleware/ensureAdmin.js';
import { ensureUser } from '../../middleware/ensureUser.js';

const router = Router();

router.post('/', add);
router.get('/', [ensureUser, ensureAdmin], list);
router.post('/promote/:id', [ensureUser, ensureAdmin], promote);

export default router;
