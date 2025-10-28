import { Router } from 'express';
import { raw } from 'express';

import { handleSendGridWebhook } from '../../controllers/sendgrid/webhook.js';
import { asyncHandler } from '../../utils/asyncHandler.js';

const router = Router();

// Webhook endpoint - needs raw body for signature verification
router.post('/webhook', [raw({ type: 'application/json' })], asyncHandler(handleSendGridWebhook));

export default router;
