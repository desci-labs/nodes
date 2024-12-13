import { Router } from 'express';

import { retryDoiMint } from '../../../controllers/doi/mint.js';
import { ensureAdmin } from '../../../middleware/ensureAdmin.js';
import { ensureUser } from '../../../middleware/permissions.js';
import { asyncHandler } from '../../../utils/asyncHandler.js';

const router = Router();
router.post('/retry-mint/:submissionId', [ensureUser, ensureAdmin], asyncHandler(retryDoiMint));

export default router;
