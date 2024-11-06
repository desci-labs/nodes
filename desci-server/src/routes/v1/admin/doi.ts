import { Router } from 'express';

import { retryMint } from '../../../controllers/doi/mint.js';
import { ensureAdmin } from '../../../middleware/ensureAdmin.js';
import { ensureUser } from '../../../middleware/permissions.js';
import { asyncHandler } from '../../../utils/asyncHandler.js';

const router = Router();
router.post('/retry-mint/:submissionId', [ensureUser, ensureAdmin], asyncHandler(retryMint));

export default router;
