import { Router } from 'express';

import { singleQuery } from '../../controllers/search/query.js';
import { ensureUser } from '../../internal.js';

const router = Router();

router.post('/', [ensureUser], singleQuery);

export default router;
