import { Router } from 'express';
import { raw } from 'express';

import {
  createSubscriptionCheckout,
  createCustomerPortal,
  getUserSubscription,
  getUserStripePurchases,
  updateSubscription,
  cancelSubscription,
  getPricingOptions,
  createPaymentIntent,
} from '../../controllers/stripe/subscription.js';
import { handleStripeWebhook } from '../../controllers/stripe/webhook.js';
import { ensureUser } from '../../middleware/permissions.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { requireStripe } from '../../utils/stripe.js';

const router = Router();

// Webhook endpoint - needs raw body for signature verification and Stripe config
router.post('/webhook', [raw({ type: 'application/json' }), requireStripe], asyncHandler(handleStripeWebhook));

// Subscription management endpoints - require authentication and Stripe config
router.post('/subscription/payment-intent', [requireStripe, ensureUser], asyncHandler(createPaymentIntent));
router.post('/subscription/checkout', [requireStripe, ensureUser], asyncHandler(createSubscriptionCheckout));
router.post('/subscription/portal', [requireStripe, ensureUser], asyncHandler(createCustomerPortal));
router.get('/subscription', [requireStripe, ensureUser], asyncHandler(getUserSubscription));
router.get('/purchases', [requireStripe, ensureUser], asyncHandler(getUserStripePurchases));
router.put('/subscription', [requireStripe, ensureUser], asyncHandler(updateSubscription));
router.delete('/subscription', [requireStripe, ensureUser], asyncHandler(cancelSubscription));

// Public pricing endpoints - no auth required
router.get('/pricing', asyncHandler(getPricingOptions));

export default router;
