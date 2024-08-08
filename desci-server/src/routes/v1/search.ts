import { Router } from 'express';

import { multiQuery } from '../../controllers/search/multiQuery.js';
import { singleQuery } from '../../controllers/search/query.js';
import { ensureUser } from '../../internal.js';

const router = Router();

router.post('/multi', [ensureUser], multiQuery);
router.post('/', [ensureUser], singleQuery);

export default router;
