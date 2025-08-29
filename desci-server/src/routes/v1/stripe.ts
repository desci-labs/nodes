import { Router } from 'express';
import { raw } from 'express';
import { handleStripeWebhook } from '../../controllers/stripe/webhook.js';
import {
  createSubscriptionCheckout,
  createCustomerPortal,
  getUserSubscription,
  updateSubscription,
  cancelSubscription,
  getPricingOptions,
} from '../../controllers/stripe/subscription.js';
import { ensureUser } from '../../middleware/permissions.js';
import { asyncHandler } from '../../utils/asyncHandler.js';

const router = Router();

// Webhook endpoint - needs raw body for signature verification
router.post('/webhook', raw({ type: 'application/json' }), asyncHandler(handleStripeWebhook));

// Subscription management endpoints - require authentication
router.post('/subscription/checkout', [ensureUser], asyncHandler(createSubscriptionCheckout));
router.post('/subscription/portal', [ensureUser], asyncHandler(createCustomerPortal));
router.get('/subscription', [ensureUser], asyncHandler(getUserSubscription));
router.put('/subscription', [ensureUser], asyncHandler(updateSubscription));
router.delete('/subscription', [ensureUser], asyncHandler(cancelSubscription));

// Public pricing endpoints - no auth required
router.get('/pricing', asyncHandler(getPricingOptions));

export default router;