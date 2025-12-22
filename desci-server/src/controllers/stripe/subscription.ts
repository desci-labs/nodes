import { SubscriptionStatus } from '@prisma/client';
import { Request, Response } from 'express';
import Stripe from 'stripe';
import { z } from 'zod';

import { STRIPE_PRICE_IDS, PLAN_DETAILS } from '../../config/stripe.js';
import { logger as parentLogger } from '../../logger.js';
import { RequestWithUser } from '../../middleware/authorisation.js';
import { SubscriptionService } from '../../services/SubscriptionService.js';
import { getStripe } from '../../utils/stripe.js';

const logger = parentLogger.child({
  module: 'STRIPE_SUBSCRIPTION',
});

const createSubscriptionSchema = z.object({
  priceId: z.string(),
  successUrl: z.string().optional(),
  cancelUrl: z.string().optional(),
  allowPromotionCodes: z.boolean().optional(),
  coupon: z.string().optional(),
});

const customerPortalSchema = z.object({
  returnUrl: z.string().optional(),
});

export const createSubscriptionCheckout = async (req: RequestWithUser, res: Response): Promise<Response> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { priceId, successUrl, cancelUrl, allowPromotionCodes, coupon } = createSubscriptionSchema.parse(req.body);

    logger.info('Creating subscription checkout', { userId, priceId, allowPromotionCodes, coupon });

    // Get or create Stripe customer
    const customer = await SubscriptionService.getOrCreateStripeCustomer(userId);

    // Create checkout session
    const stripe = getStripe();
    const sessionConfig: Stripe.Checkout.SessionCreateParams = {
      customer: customer.id,
      payment_method_types: ['card'],
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      mode: 'subscription',
      success_url: successUrl || `${req.headers.origin}/settings/subscription?success=true`,
      cancel_url: cancelUrl || `${req.headers.origin}/settings/subscription?canceled=true`,
      metadata: {
        userId: userId.toString(),
      },
    };

    // Add promotion codes or specific coupon support
    if (allowPromotionCodes) {
      sessionConfig.allow_promotion_codes = true;
    } else if (coupon) {
      // The 'coupon' parameter is actually a promotion code string (e.g., STUDENT-123-ABC12345)
      // We need to look it up to get the promotion code ID
      try {
        const promotionCodes = await stripe.promotionCodes.list({
          code: coupon,
          limit: 1,
        });

        if (promotionCodes.data.length > 0) {
          // Found the promotion code, use its ID
          sessionConfig.discounts = [{ promotion_code: promotionCodes.data[0].id }];
          logger.info('Applied promotion code', { code: coupon, promotionCodeId: promotionCodes.data[0].id });
        } else {
          // Not found as promotion code, try as coupon ID (fallback for direct coupon IDs)
          sessionConfig.discounts = [{ coupon }];
          logger.info('Applied as coupon ID', { coupon });
        }
      } catch (error) {
        logger.error('Failed to look up promotion code, trying as coupon ID', { error, coupon });
        // Fallback to treating it as a coupon ID
        sessionConfig.discounts = [{ coupon }];
      }
    }

    const session = await stripe.checkout.sessions.create(sessionConfig);

    return res.status(200).json({ sessionId: session.id });
  } catch (error: any) {
    logger.error('Failed to create subscription checkout', {
      error: error.message,
      userId: req.user?.id,
    });
    return res.status(500).json({ error: 'Failed to create subscription checkout' });
  }
};

export const createPaymentSchema = z.object({
  body: z.object({
    priceId: z.string(),
  }),
});

export const createPaymentIntent = async (req: RequestWithUser, res: Response): Promise<Response> => {
  const { priceId } = createPaymentSchema.parse(req).body;

  const stripe = getStripe();
  const customer = await SubscriptionService.getOrCreateStripeCustomer(req.user?.id);
  const ephemeralKey = await stripe.ephemeralKeys.create({ customer: customer.id }, { apiVersion: '2025-08-27.basil' });

  const existingSubscription = await SubscriptionService.getUserSubscriptionWithDetails(req.user?.id);

  if (existingSubscription) {
    const subscription = await stripe.subscriptions.retrieve(existingSubscription.stripeSubscriptionId, {
      expand: ['latest_invoice.confirmation_secret'],
    });
    logger.info({ subscriptionId: subscription.id }, 'stripe::existing subscription');

    if (subscription.status !== 'incomplete' && subscription.metadata.priceId === priceId) {
      return res.status(200).json({
        paymentIntent: (subscription.latest_invoice as Stripe.Invoice)?.confirmation_secret?.client_secret,
        ephemeralKey: ephemeralKey.secret,
        customer: customer.id,
      });
    }
  }

  // handle unpaid and active subscriptions

  const price = await stripe.prices.retrieve(priceId);
  const product = await stripe.products.retrieve(price.product as string);

  const subscription = await stripe.subscriptions.create({
    customer: customer.id,
    description: product.name ?? '',
    items: [
      {
        price: priceId,
      },
    ],
    metadata: {
      userId: req.user?.id,
      priceId: priceId,
      productId: product.id,
    },
    payment_behavior: 'default_incomplete',
    payment_settings: { save_default_payment_method: 'on_subscription' },
    billing_mode: { type: 'flexible' },
    expand: ['latest_invoice.confirmation_secret'],
  });
  logger.info({ customerId: customer.id, userId: req.user?.id }, 'stripe::new subscription');

  if (!(subscription.latest_invoice as Stripe.Invoice)?.confirmation_secret?.client_secret) {
    throw new Error('Subscription confirmation secret is not set');
  }

  return res.status(200).json({
    clientSecret: (subscription.latest_invoice as Stripe.Invoice)?.confirmation_secret?.client_secret,
    ephemeralKey: ephemeralKey.secret,
    customer: customer.id,
  });
};

export const createCustomerPortal = async (req: RequestWithUser, res: Response): Promise<Response> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { returnUrl } = customerPortalSchema.parse(req.body);

    logger.info({ userId }, 'Creating customer portal session');

    // Get user's Stripe customer ID from any subscription (not just active ones)
    const subscription = await SubscriptionService.getUserSubscriptionWithDetails(userId);
    if (!subscription?.stripeCustomerId) {
      logger.warn({ userId }, 'No customer found for user');
      return res.status(404).json({ error: 'No customer found' });
    }

    logger.info({ customerId: subscription.stripeCustomerId }, 'Found customer for portal');

    // Create portal session
    try {
      const stripe = getStripe();
      const portalSession = await stripe.billingPortal.sessions.create({
        customer: subscription.stripeCustomerId,
        return_url: returnUrl || `${req.headers.origin}/settings/subscription`,
      });

      logger.info({ sessionId: portalSession.id }, 'Portal session created successfully');
      return res.status(200).json({ url: portalSession.url });
    } catch (stripeError: any) {
      logger.error(
        {
          error: stripeError.message,
          type: stripeError.type,
          code: stripeError.code,
          customerId: subscription.stripeCustomerId,
        },
        'Stripe portal creation failed',
      );
      throw stripeError;
    }
  } catch (error: any) {
    logger.error(
      {
        error: error.message,
        userId: req.user?.id,
      },
      'Failed to create customer portal session',
    );
    return res.status(500).json({ error: 'Failed to create customer portal session' });
  }
};

export const getUserSubscription = async (req: RequestWithUser, res: Response): Promise<Response> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    logger.info({ userId }, 'Getting user subscription');

    let subscription = await SubscriptionService.getUserSubscriptionWithDetails(userId);

    if (!subscription || subscription.status !== SubscriptionStatus.ACTIVE) {
      logger.info({ userId }, 'stripe::no active subscription found, fetching from Stripe');
      const stripeCustomerId = await SubscriptionService.getStripeCustomerId(userId);
      logger.info({ stripeCustomerId }, 'stripe::stripe customer ID');

      if (!stripeCustomerId) return res.status(200).json(null);

      const stripe = getStripe();
      const subscriptions = await stripe.subscriptions.list({
        customer: stripeCustomerId,
        status: 'active',
      });
      const activeSubscription = subscriptions.data.find((subscription) => subscription.status === 'active');

      logger.info({ activeSubscription }, 'stripe::active subscription');

      if (!activeSubscription) return res.status(404).json({ error: 'No subscription found' });

      await SubscriptionService.handleSubscriptionCreated(activeSubscription);

      logger.info(
        { userId, stripeCustomerId, subscriptionId: activeSubscription.id },
        'stripe::subscription created, fetching from DB',
      );

      subscription = await SubscriptionService.getUserSubscriptionWithDetails(userId);
    }

    return res.status(200).json(subscription);
  } catch (error: any) {
    logger.error(
      {
        error: error.message,
        userId: req.user?.id,
      },
      'Failed to get user subscription',
    );
    return res.status(500).json({ error: 'Failed to get user subscription' });
  }
};

export const updateSubscription = async (req: RequestWithUser, res: Response): Promise<Response> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { planType } = z.object({ planType: z.string() }).parse(req.body);

    logger.info('Updating subscription', { userId, planType });

    await SubscriptionService.updateSubscriptionPlan(userId, planType);

    return res.status(200).json({ success: true });
  } catch (error: any) {
    logger.error('Failed to update subscription', {
      error: error.message,
      userId: req.user?.id,
    });
    return res.status(500).json({ error: 'Failed to update subscription' });
  }
};

export const cancelSubscription = async (req: RequestWithUser, res: Response): Promise<Response> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    logger.info('Canceling subscription', { userId });

    await SubscriptionService.cancelSubscription(userId);

    return res.status(200).json({ success: true });
  } catch (error: any) {
    logger.error('Failed to cancel subscription', {
      error: error.message,
      userId: req.user?.id,
    });
    return res.status(500).json({ error: 'Failed to cancel subscription' });
  }
};

export const getPricingOptions = async (req: Request, res: Response): Promise<Response> => {
  try {
    // const { STRIPE_PRICE_IDS, PLAN_DETAILS } = require('../../config/stripe.js');

    const pricingOptions = Object.entries(PLAN_DETAILS).map(([planName, details]: [string, any]) => ({
      planName,
      name: details.name,
      planType: details.planType,
      features: details.features,
      pricing: details.pricing,
      priceIds: STRIPE_PRICE_IDS[planName as keyof typeof STRIPE_PRICE_IDS],
    }));

    return res.status(200).json({ plans: pricingOptions });
  } catch (error: any) {
    logger.error('Failed to get pricing options', { error: error.message });
    return res.status(500).json({ error: 'Failed to get pricing options' });
  }
};
