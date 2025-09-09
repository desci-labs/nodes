import { Request, Response } from 'express';
import Stripe from 'stripe';

import { logger as parentLogger } from '../../logger.js';
import { SubscriptionService } from '../../services/SubscriptionService.js';
import { getStripe } from '../../utils/stripe.js';

const logger = parentLogger.child({
  module: 'STRIPE_WEBHOOK',
});

const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

export const handleStripeWebhook = async (req: Request, res: Response): Promise<Response> => {
  const sig = req.headers['stripe-signature'];

  let event: Stripe.Event;

  try {
    if (!endpointSecret) {
      logger.error('STRIPE_WEBHOOK_SECRET not configured');
      return res.status(500).json({ error: 'Webhook secret not configured' });
    }

    if (!sig) {
      logger.error('No stripe-signature header found');
      return res.status(400).json({ error: 'Missing stripe-signature header' });
    }

    // Verify webhook signature
    const stripe = getStripe();
    event = stripe.webhooks.constructEvent(req.body, sig as string, endpointSecret);
    logger.info(`Received Stripe webhook: ${event.type}`, { eventId: event.id });
  } catch (err: any) {
    const errorDetails = {
      error: err.message,
      hasBody: !!req.body,
      bodyType: typeof req.body,
      bodyLength: req.body ? req.body.length : 0,
      bodyIsBuffer: Buffer.isBuffer(req.body),
      bodyIsString: typeof req.body === 'string',
      bodyFirst50Chars: req.body ? JSON.stringify(req.body).substring(0, 50) : 'no body',
      hasSignature: !!sig,
      signatureLength: sig ? sig.length : 0,
      secretLength: endpointSecret ? endpointSecret.length : 0,
    };
    logger.error('Webhook signature verification failed', errorDetails);
    console.error('WEBHOOK DEBUG:', JSON.stringify(errorDetails, null, 2));
    return res.status(400).json({ error: 'Webhook signature verification failed' });
  }

  // Handle the event
  try {
    switch (event.type) {
      // Customer lifecycle events
      case 'customer.created':
        await handleCustomerCreated(event.data.object as Stripe.Customer);
        break;

      // Subscription lifecycle events
      case 'customer.subscription.created':
        await handleSubscriptionCreated(event.data.object as Stripe.Subscription);
        break;
      case 'customer.subscription.updated':
        await handleSubscriptionUpdated(event.data.object as Stripe.Subscription);
        break;
      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
        break;
      case 'customer.subscription.trial_will_end':
        await handleTrialWillEnd(event.data.object as Stripe.Subscription);
        break;

      // Invoice events
      case 'invoice.created':
        await handleInvoiceCreated(event.data.object as Stripe.Invoice);
        break;
      case 'invoice.payment_succeeded':
        await handleInvoicePaymentSucceeded(event.data.object as Stripe.Invoice);
        break;
      case 'invoice.payment_failed':
        await handleInvoicePaymentFailed(event.data.object as Stripe.Invoice);
        break;

      // Payment method events
      case 'payment_method.attached':
        await handlePaymentMethodAttached(event.data.object as Stripe.PaymentMethod);
        break;
      case 'payment_method.detached':
        await handlePaymentMethodDetached(event.data.object as Stripe.PaymentMethod);
        break;

      // Payment intent events
      case 'payment_intent.created':
        await handlePaymentIntentCreated(event.data.object as Stripe.PaymentIntent);
        break;
      case 'payment_intent.succeeded':
        await handlePaymentIntentSucceeded(event.data.object as Stripe.PaymentIntent);
        break;

      // Charge events
      case 'charge.succeeded':
        await handleChargeSucceeded(event.data.object as Stripe.Charge);
        break;

      // Customer events
      case 'customer.updated':
        await handleCustomerUpdated(event.data.object as Stripe.Customer);
        break;

      // Checkout events
      case 'checkout.session.completed':
        await handleCheckoutSessionCompleted(event.data.object as Stripe.Checkout.Session);
        break;

      // Invoice finalization
      case 'invoice.finalized':
        await handleInvoiceFinalized(event.data.object as Stripe.Invoice);
        break;

      default:
        logger.warn(`Unhandled event type: ${event.type}`);
    }

    return res.status(200).json({ received: true });
  } catch (error: any) {
    logger.error('Error processing webhook', { error: error.message, eventType: event!.type });
    return res.status(500).json({ error: 'Error processing webhook' });
  }
};

async function handleCustomerCreated(customer: Stripe.Customer) {
  logger.info('Processing customer created', { customerId: customer.id });

  try {
    await SubscriptionService.handleCustomerCreated(customer);
  } catch (error: any) {
    logger.error('Failed to handle customer created', {
      customerId: customer.id,
      error: error.message,
    });
    throw error;
  }
}

async function handleSubscriptionCreated(subscription: Stripe.Subscription) {
  logger.info('Processing subscription created', { subscriptionId: subscription.id });

  try {
    await SubscriptionService.handleSubscriptionCreated(subscription);
  } catch (error: any) {
    logger.error('Failed to handle subscription created', {
      subscriptionId: subscription.id,
      error: error.message,
    });
    throw error;
  }
}

async function handleSubscriptionUpdated(subscription: Stripe.Subscription) {
  logger.info('Processing subscription updated', { subscriptionId: subscription.id });

  try {
    await SubscriptionService.handleSubscriptionUpdated(subscription);
  } catch (error: any) {
    logger.error('Failed to handle subscription updated', {
      subscriptionId: subscription.id,
      error: error.message,
    });
    throw error;
  }
}

async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
  logger.info('Processing subscription deleted', { subscriptionId: subscription.id });

  try {
    await SubscriptionService.handleSubscriptionDeleted(subscription);
  } catch (error: any) {
    logger.error('Failed to handle subscription deleted', {
      subscriptionId: subscription.id,
      error: error.message,
    });
    throw error;
  }
}

async function handleInvoiceCreated(invoice: Stripe.Invoice) {
  logger.info('Processing invoice created', { invoiceId: invoice.id });

  try {
    await SubscriptionService.handleInvoiceCreated(invoice);
  } catch (error: any) {
    logger.error('Failed to handle invoice created', {
      invoiceId: invoice.id,
      error: error.message,
    });
    throw error;
  }
}

async function handleInvoicePaymentSucceeded(invoice: Stripe.Invoice) {
  logger.info('Processing invoice payment succeeded', { invoiceId: invoice.id });

  try {
    await SubscriptionService.handleInvoicePaymentSucceeded(invoice);
  } catch (error: any) {
    logger.error('Failed to handle invoice payment succeeded', {
      invoiceId: invoice.id,
      error: error.message,
    });
    throw error;
  }
}

async function handleInvoicePaymentFailed(invoice: Stripe.Invoice) {
  logger.info('Processing invoice payment failed', { invoiceId: invoice.id });

  try {
    await SubscriptionService.handleInvoicePaymentFailed(invoice);
  } catch (error: any) {
    logger.error('Failed to handle invoice payment failed', {
      invoiceId: invoice.id,
      error: error.message,
    });
    throw error;
  }
}

async function handlePaymentMethodAttached(paymentMethod: Stripe.PaymentMethod) {
  logger.info('Processing payment method attached', { paymentMethodId: paymentMethod.id });

  try {
    await SubscriptionService.handlePaymentMethodAttached(paymentMethod);
  } catch (error: any) {
    logger.error('Failed to handle payment method attached', {
      paymentMethodId: paymentMethod.id,
      error: error.message,
    });
    throw error;
  }
}

async function handlePaymentMethodDetached(paymentMethod: Stripe.PaymentMethod) {
  logger.info('Processing payment method detached', { paymentMethodId: paymentMethod.id });

  try {
    await SubscriptionService.handlePaymentMethodDetached(paymentMethod);
  } catch (error: any) {
    logger.error('Failed to handle payment method detached', {
      paymentMethodId: paymentMethod.id,
      error: error.message,
    });
    throw error;
  }
}

async function handleTrialWillEnd(subscription: Stripe.Subscription) {
  logger.info('Processing trial will end', { subscriptionId: subscription.id });

  try {
    await SubscriptionService.handleTrialWillEnd(subscription);
  } catch (error: any) {
    logger.error('Failed to handle trial will end', {
      subscriptionId: subscription.id,
      error: error.message,
    });
    throw error;
  }
}

async function handlePaymentIntentCreated(paymentIntent: Stripe.PaymentIntent) {
  logger.info('Processing payment intent created', { paymentIntentId: paymentIntent.id });
  // Payment intents are automatically handled by Stripe, no action needed
}

async function handlePaymentIntentSucceeded(paymentIntent: Stripe.PaymentIntent) {
  logger.info('Processing payment intent succeeded', { paymentIntentId: paymentIntent.id });
  // Payment success is handled via invoice.payment_succeeded, no action needed
}

async function handleChargeSucceeded(charge: Stripe.Charge) {
  logger.info('Processing charge succeeded', { chargeId: charge.id });
  // Charges are handled via invoice events, no action needed
}

async function handleCustomerUpdated(customer: Stripe.Customer) {
  logger.info('Processing customer updated', { customerId: customer.id });
  // Customer updates like email/name changes can be handled if needed
  // For now, just log the event
}

async function handleCheckoutSessionCompleted(session: Stripe.Checkout.Session) {
  logger.info('Processing checkout session completed', { sessionId: session.id });
  // The subscription creation will be handled by the subscription.created event
  // No additional action needed here
}

async function handleInvoiceFinalized(invoice: Stripe.Invoice) {
  logger.info('Processing invoice finalized', { invoiceId: invoice.id });
  // Invoice finalization is handled by invoice.created and invoice.payment_succeeded
  // No additional action needed
}
