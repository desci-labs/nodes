import { Request, Response } from 'express';
import Stripe from 'stripe';

import { prisma } from '../../client.js';
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
      logger.error({}, 'STRIPE_WEBHOOK_SECRET not configured');
      return res.status(500).json({ error: 'Webhook secret not configured' });
    }

    if (!sig) {
      logger.error({}, 'No stripe-signature header found');
      return res.status(400).json({ error: 'Missing stripe-signature header' });
    }

    // Verify webhook signature
    const stripe = getStripe();
    event = stripe.webhooks.constructEvent(req.body, sig as string, endpointSecret);
    logger.info({ eventId: event.id }, `Received Stripe webhook: ${event.type}`);
  } catch (err: any) {
    const errorDetails = {
      errorMessage: err.message,
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
    logger.error({ err, ...errorDetails }, 'Webhook signature verification failed');
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
        logger.warn({}, `Unhandled event type: ${event.type}`);
    }

    return res.status(200).json({ received: true });
  } catch (err: any) {
    logger.error({ err, eventType: event!.type }, 'Error processing webhook');
    return res.status(500).json({ error: 'Error processing webhook' });
  }
};

async function handleCustomerCreated(customer: Stripe.Customer) {
  logger.info({ customerId: customer.id }, 'stripe::handleCustomerCreated');

  try {
    await SubscriptionService.handleCustomerCreated(customer);
  } catch (err: any) {
    logger.error({
      customerId: customer.id,
      err,
    }, 'Failed to handle customer created');
    throw err;
  }
}

async function handleSubscriptionCreated(subscription: Stripe.Subscription) {
  logger.info({ subscriptionId: subscription.id }, 'stripe::handleSubscriptionCreated');

  try {
    await SubscriptionService.handleSubscriptionCreated(subscription);
  } catch (err: any) {
    logger.error({
      subscriptionId: subscription.id,
      err,
    }, 'Failed to handle subscription created');
    throw err;
  }
}

async function handleSubscriptionUpdated(subscription: Stripe.Subscription) {
  logger.info({ subscriptionId: subscription.id }, 'stripe::handleSubscriptionUpdated');

  try {
    await SubscriptionService.handleSubscriptionUpdated(subscription);
  } catch (err: any) {
    logger.error({
      subscriptionId: subscription.id,
      err,
    }, 'Failed to handle subscription updated');
    throw err;
  }
}

async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
  logger.info({ subscriptionId: subscription.id }, 'Processing subscription deleted');

  try {
    await SubscriptionService.handleSubscriptionDeleted(subscription);
  } catch (err: any) {
    logger.error({
      subscriptionId: subscription.id,
      err,
    }, 'Failed to handle subscription deleted');
    throw err;
  }
}

async function handleInvoiceCreated(invoice: Stripe.Invoice) {
  logger.info({ invoiceId: invoice.id }, 'stripe::handleInvoiceCreated');

  try {
    await SubscriptionService.handleInvoiceCreated(invoice);
  } catch (err: any) {
    logger.error({
      invoiceId: invoice.id,
      err,
    }, 'Failed to handle invoice created');
    throw err;
  }
}

async function handleInvoicePaymentSucceeded(invoice: Stripe.Invoice) {
  logger.info({ invoiceId: invoice.id }, 'stripe::handleInvoicePaymentSucceeded');

  try {
    await SubscriptionService.handleInvoicePaymentSucceeded(invoice);
  } catch (err: any) {
    logger.error({
      invoiceId: invoice.id,
      err,
    }, 'Failed to handle invoice payment succeeded');
    throw err;
  }
}

async function handleInvoicePaymentFailed(invoice: Stripe.Invoice) {
  logger.info({ invoiceId: invoice.id }, 'stripe::handleInvoicePaymentFailed');

  try {
    await SubscriptionService.handleInvoicePaymentFailed(invoice);
  } catch (err: any) {
    logger.error({
      invoiceId: invoice.id,
      err,
    }, 'Failed to handle invoice payment failed');
    throw err;
  }
}

async function handlePaymentMethodAttached(paymentMethod: Stripe.PaymentMethod) {
  logger.info({ paymentMethodId: paymentMethod.id }, 'stripe::handlePaymentMethodAttached');

  try {
    await SubscriptionService.handlePaymentMethodAttached(paymentMethod);
  } catch (err: any) {
    logger.error({
      paymentMethodId: paymentMethod.id,
      err,
    }, 'Failed to handle payment method attached');
    throw err;
  }
}

async function handlePaymentMethodDetached(paymentMethod: Stripe.PaymentMethod) {
  logger.info({ paymentMethodId: paymentMethod.id }, 'stripe::handlePaymentMethodDetached');

  try {
    await SubscriptionService.handlePaymentMethodDetached(paymentMethod);
  } catch (err: any) {
    logger.error({
      paymentMethodId: paymentMethod.id,
      err,
    }, 'Failed to handle payment method detached');
    throw err;
  }
}

async function handleTrialWillEnd(subscription: Stripe.Subscription) {
  logger.info({ subscriptionId: subscription.id }, 'stripe::handleTrialWillEnd');

  try {
    await SubscriptionService.handleTrialWillEnd(subscription);
  } catch (err: any) {
    logger.error({
      subscriptionId: subscription.id,
      err,
    }, 'Failed to handle trial will end');
    throw err;
  }
}

async function handlePaymentIntentCreated(paymentIntent: Stripe.PaymentIntent) {
  logger.info({ paymentIntentId: paymentIntent.id }, 'stripe::handlePaymentIntentCreated');
  // Payment intents are automatically handled by Stripe, no action needed
}

async function handlePaymentIntentSucceeded(paymentIntent: Stripe.PaymentIntent) {
  logger.info({ paymentIntentId: paymentIntent.customer }, 'stripe::handlePaymentIntentSucceeded');
  // Payment success is handled via invoice.payment_succeeded, no action needed
  const stripe = getStripe();
  const subscriptions = await stripe.subscriptions.list({
    customer: paymentIntent.customer as string,
    status: 'active',
  });
  const activeSubscription = subscriptions.data.find((subscription) => subscription.status === 'active');
  logger.info({ activeSubscription }, 'stripe::Active subscription found');
  if (!activeSubscription) {
    logger.info({ paymentIntentId: paymentIntent.id }, 'No active subscription found (possible one-time checkout)');
    return;
  }
  logger.info({ subscriptionId: activeSubscription.id }, 'Handling subscription created');
  await SubscriptionService.handleSubscriptionCreated(activeSubscription);
}

async function handleChargeSucceeded(charge: Stripe.Charge) {
  logger.info({ chargeId: charge.id }, 'Processing charge succeeded');
  // Charges are handled via invoice events, no action needed
}

async function handleCustomerUpdated(customer: Stripe.Customer) {
  logger.info({ customerId: customer.id }, 'Processing customer updated');
  // Customer updates like email/name changes can be handled if needed
  // For now, just log the event
}

async function handleCheckoutSessionCompleted(session: Stripe.Checkout.Session) {
  logger.info({ sessionId: session.id, mode: session.mode }, 'Processing checkout session completed');

  // Mark the checkout as completed to prevent abandoned cart emails
  try {
    await prisma.abandonedCheckout.updateMany({
      where: { stripeSessionId: session.id },
      data: { completedAt: new Date() },
    });
    logger.debug({ sessionId: session.id }, 'Marked checkout session as completed');
  } catch (err) {
    logger.error({ err, sessionId: session.id }, 'Failed to mark checkout session as completed');
  }

  // Recurring subscriptions are handled by customer.subscription.* webhooks
  // One-time payment checkouts (e.g. lifetime and bundles) are handled here
  if (session.mode === 'payment') {
    await SubscriptionService.handleCheckoutSessionCompleted(session);
  }
}

async function handleInvoiceFinalized(invoice: Stripe.Invoice) {
  logger.info({ invoiceId: invoice.id }, 'Processing invoice finalized');
  // Invoice finalization is handled by invoice.created and invoice.payment_succeeded
  // No additional action needed
}
