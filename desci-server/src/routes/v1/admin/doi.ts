import { Router } from 'express';

import { retryMint } from '../../../controllers/doi/mint.js';
import { ensureNodeAccess } from '../../../middleware/authorisation.js';
import { ensureUser } from '../../../middleware/permissions.js';
import { asyncHandler } from '../../../utils/asyncHandler.js';

const router = Router();
router.post('/mint/:uuid', [ensureUser, ensureNodeAccess], asyncHandler(retryMint));

export default router;
