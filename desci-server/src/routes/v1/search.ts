import { Router } from 'express';

import { multiQuery } from '../../controllers/search/multiQuery.js';
import { dpidQuery, singleDpidQuery, singleQuery } from '../../controllers/search/query.js';
import { asyncHandler } from '../../utils/asyncHandler.js';

const router = Router();

router.post('/multi', multiQuery);
router.post('/', singleQuery);
router.post('/library', asyncHandler(dpidQuery));
router.post('/library/:dpid', asyncHandler(singleDpidQuery));

export default router;
