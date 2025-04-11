import { Router } from 'express';

import { multiQuery } from '../../controllers/search/multiQuery.js';
import {
  dpidQuery,
  singleDpidQuery,
  singleQuery,
  byMonthQuery,
  byMonthFilterQuery,
} from '../../controllers/search/query.js';
import { asyncHandler } from '../../utils/asyncHandler.js';

const router = Router();

router.post('/multi', multiQuery);
router.post('/', singleQuery);
router.post('/library', asyncHandler(dpidQuery));
router.post('/library/:dpid', asyncHandler(singleDpidQuery));
router.post('/by-month', asyncHandler(byMonthQuery));
router.post('/by-month/:yyyyMM', asyncHandler(byMonthFilterQuery));

export default router;
