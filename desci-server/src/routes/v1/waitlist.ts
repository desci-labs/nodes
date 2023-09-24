import { Router } from 'express';

import { add, list, promote } from 'controllers/waitlist';
import { ensureAdmin } from 'middleware/ensureAdmin';
import { ensureUser } from 'middleware/ensureUser';

const router = Router();

router.post('/', add);
router.get('/', [ensureUser, ensureAdmin], list);
router.post('/promote/:id', [ensureUser, ensureAdmin], promote);

export default router;
