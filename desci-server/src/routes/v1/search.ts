import { Router } from 'express';

import { multiQuery } from '../../controllers/search/multiQuery.js';
import { singleQuery } from '../../controllers/search/query.js';

const router = Router();

router.post('/multi', multiQuery);
router.post('/', singleQuery);

export default router;
