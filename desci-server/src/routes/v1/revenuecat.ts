import { Router } from 'express';
import { raw } from 'express';

import { handleRevenueCatWebhook } from '../../controllers/revenuecat/webhook.js';
import { asyncHandler } from '../../utils/asyncHandler.js';

const router = Router();

// Webhook endpoint - needs raw body for signature verification and Stripe config
router.post('/webhook', [raw({ type: 'application/json' })], asyncHandler(handleRevenueCatWebhook));

export default router;
