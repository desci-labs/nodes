import { Router } from 'express';
import { raw } from 'express';

import { handleRevenueCatWebhook } from '../../controllers/revenuecat/webhook.js';
import { asyncHandler } from '../../utils/asyncHandler.js';

const router = Router();

router.post('/webhook', asyncHandler(handleRevenueCatWebhook));

export default router;
