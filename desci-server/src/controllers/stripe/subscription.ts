import { Request, Response } from 'express';
import { z } from 'zod';
import Stripe from 'stripe';
import { logger as parentLogger } from '../../logger.js';
import { SubscriptionService } from '../../services/SubscriptionService.js';
import { RequestWithUser } from '../../middleware/authorisation.js';
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
      sessionConfig.discounts = [{ coupon }];
    }

    const session = await stripe.checkout.sessions.create(sessionConfig);

    return res.status(200).json({ sessionId: session.id });
  } catch (error: any) {
    logger.error('Failed to create subscription checkout', { 
      error: error.message, 
      userId: req.user?.id 
    });
    return res.status(500).json({ error: 'Failed to create subscription checkout' });
  }
};

export const createCustomerPortal = async (req: RequestWithUser, res: Response): Promise<Response> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { returnUrl } = customerPortalSchema.parse(req.body);

    logger.info('Creating customer portal session', { userId });

    // Get user's Stripe customer ID from any subscription (not just active ones)
    const subscription = await SubscriptionService.getUserSubscriptionWithDetails(userId);
    if (!subscription?.stripeCustomerId) {
      logger.warn('No customer found for user', { userId });
      return res.status(404).json({ error: 'No customer found' });
    }

    logger.info('Found customer for portal', { customerId: subscription.stripeCustomerId });

    // Create portal session
    try {
      const stripe = getStripe();
      const portalSession = await stripe.billingPortal.sessions.create({
        customer: subscription.stripeCustomerId,
        return_url: returnUrl || `${req.headers.origin}/settings/subscription`,
      });

      logger.info('Portal session created successfully', { sessionId: portalSession.id });
      return res.status(200).json({ url: portalSession.url });
    } catch (stripeError: any) {
      logger.error('Stripe portal creation failed', { 
        error: stripeError.message,
        type: stripeError.type,
        code: stripeError.code,
        customerId: subscription.stripeCustomerId
      });
      throw stripeError;
    }
  } catch (error: any) {
    logger.error('Failed to create customer portal session', { 
      error: error.message, 
      userId: req.user?.id 
    });
    return res.status(500).json({ error: 'Failed to create customer portal session' });
  }
};

export const getUserSubscription = async (req: RequestWithUser, res: Response): Promise<Response> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    logger.info('Getting user subscription', { userId });

    const subscription = await SubscriptionService.getUserSubscriptionWithDetails(userId);
    
    if (!subscription) {
      return res.status(404).json({ error: 'No subscription found' });
    }

    return res.status(200).json(subscription);
  } catch (error: any) {
    logger.error('Failed to get user subscription', { 
      error: error.message, 
      userId: req.user?.id 
    });
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
      userId: req.user?.id 
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
      userId: req.user?.id 
    });
    return res.status(500).json({ error: 'Failed to cancel subscription' });
  }
};

export const getPricingOptions = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { STRIPE_PRICE_IDS, PLAN_DETAILS } = require('../../config/stripe.js');
    
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