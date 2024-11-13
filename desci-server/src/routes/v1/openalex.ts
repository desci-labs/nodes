import { Router } from 'express';

import { getOpenAlexWork } from '../../controllers/nodes/openalex.js';
import { asyncHandler } from '../../utils/asyncHandler.js';

const router = Router();

router.get('/work/:workId', asyncHandler(getOpenAlexWork));

export default router;
