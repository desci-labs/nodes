import Stripe from 'stripe';
import { PrismaClient, PlanType, SubscriptionStatus, StripeInvoiceStatus, PaymentMethodType, BillingInterval } from '@prisma/client';
import { logger as parentLogger } from '../logger.js';

const logger = parentLogger.child({
  module: 'SUBSCRIPTION_SERVICE',
});

const prisma = new PrismaClient();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export class SubscriptionService {
  static async getOrCreateStripeCustomer(userId: number) {
    logger.info('Getting or creating Stripe customer', { userId });

    // Check if user already has a Stripe customer
    const existingSubscription = await prisma.subscription.findFirst({
      where: { userId },
      select: { stripeCustomerId: true },
    });

    if (existingSubscription?.stripeCustomerId) {
      return await stripe.customers.retrieve(existingSubscription.stripeCustomerId);
    }

    // Get user details for customer creation
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, name: true },
    });

    if (!user) {
      throw new Error('User not found');
    }

    // Create new Stripe customer
    const customer = await stripe.customers.create({
      email: user.email || undefined,
      name: user.name || undefined,
      metadata: {
        userId: userId.toString(),
      },
    });

    logger.info('Created new Stripe customer', { userId, customerId: customer.id });

    return customer;
  }

  static async handleCustomerCreated(customer: Stripe.Customer) {
    logger.info('Handling customer created', { customerId: customer.id });

    const userId = customer.metadata?.userId ? parseInt(customer.metadata.userId) : null;
    if (!userId) {
      logger.warn('Customer created without userId metadata', { customerId: customer.id });
      return;
    }

    // Update any existing subscriptions or create a placeholder
    // This will be updated when the actual subscription is created
    logger.info('Customer created successfully processed', { customerId: customer.id, userId });
  }

  static async handleSubscriptionCreated(subscription: Stripe.Subscription) {
    logger.info('Handling subscription created', { subscriptionId: subscription.id });

    const userId = await this.getUserIdFromCustomer(subscription.customer as string);
    if (!userId) {
      throw new Error('Unable to find userId from customer');
    }

    const priceId = subscription.items.data[0]?.price.id;
    const planType = this.mapStripePriceToPlanType(priceId);
    const billingInterval = this.getBillingIntervalFromPriceId(priceId);
    const sub = subscription as any; // Cast to any to access properties

    await prisma.subscription.create({
      data: {
        userId,
        stripeCustomerId: subscription.customer as string,
        stripeSubscriptionId: subscription.id,
        stripePriceId: priceId,
        status: this.mapStripeStatusToPrismaStatus(subscription.status),
        planType,
        billingInterval,
        currentPeriodStart: new Date(sub.current_period_start * 1000),
        currentPeriodEnd: new Date(sub.current_period_end * 1000),
        cancelAtPeriodEnd: sub.cancel_at_period_end,
        trialStart: sub.trial_start ? new Date(sub.trial_start * 1000) : null,
        trialEnd: sub.trial_end ? new Date(sub.trial_end * 1000) : null,
      },
    });

    // Update user feature limits based on new plan
    await this.updateUserFeatureLimits(userId, planType);

    logger.info('Subscription created successfully', { subscriptionId: subscription.id, userId });
  }

  static async handleSubscriptionUpdated(subscription: Stripe.Subscription) {
    logger.info('Handling subscription updated', { subscriptionId: subscription.id });

    const priceId = subscription.items.data[0]?.price.id;
    const planType = this.mapStripePriceToPlanType(priceId);
    const billingInterval = this.getBillingIntervalFromPriceId(priceId);
    const sub = subscription as any; // Cast to any to access properties

    const updatedSubscription = await prisma.subscription.update({
      where: { stripeSubscriptionId: subscription.id },
      data: {
        status: this.mapStripeStatusToPrismaStatus(subscription.status),
        planType,
        billingInterval,
        stripePriceId: priceId,
        currentPeriodStart: new Date(sub.current_period_start * 1000),
        currentPeriodEnd: new Date(sub.current_period_end * 1000),
        cancelAtPeriodEnd: sub.cancel_at_period_end,
        canceledAt: sub.canceled_at ? new Date(sub.canceled_at * 1000) : null,
        trialStart: sub.trial_start ? new Date(sub.trial_start * 1000) : null,
        trialEnd: sub.trial_end ? new Date(sub.trial_end * 1000) : null,
      },
    });

    // Update user feature limits
    await this.updateUserFeatureLimits(updatedSubscription.userId, planType);

    logger.info('Subscription updated successfully', { subscriptionId: subscription.id });
  }

  static async handleSubscriptionDeleted(subscription: Stripe.Subscription) {
    logger.info('Handling subscription deleted', { subscriptionId: subscription.id });

    const updatedSubscription = await prisma.subscription.update({
      where: { stripeSubscriptionId: subscription.id },
      data: {
        status: SubscriptionStatus.CANCELED,
        canceledAt: new Date(),
      },
    });

    // Reset user to free tier
    await this.updateUserFeatureLimits(updatedSubscription.userId, PlanType.FREE);

    logger.info('Subscription deleted successfully', { subscriptionId: subscription.id });
  }

  static async handleInvoiceCreated(invoice: Stripe.Invoice) {
    logger.info('Handling invoice created', { invoiceId: invoice.id });

    const userId = await this.getUserIdFromCustomer(invoice.customer as string);
    if (!userId) {
      logger.warn('Invoice created without valid customer', { invoiceId: invoice.id });
      return;
    }

    const subscription = await prisma.subscription.findFirst({
      where: { stripeCustomerId: invoice.customer as string, status: SubscriptionStatus.ACTIVE },
    });

    await prisma.invoice.create({
      data: {
        userId,
        subscriptionId: subscription?.id,
        stripeInvoiceId: invoice.id,
        amount: (invoice.amount_due || 0) / 100, // Convert from cents
        currency: invoice.currency,
        status: this.mapStripeInvoiceStatusToPrismaStatus(invoice.status),
        description: invoice.lines.data[0]?.description || 'Subscription payment',
        invoiceUrl: invoice.hosted_invoice_url,
        pdfUrl: invoice.invoice_pdf,
        dueDate: invoice.due_date ? new Date(invoice.due_date * 1000) : null,
      },
    });

    logger.info('Invoice created successfully', { invoiceId: invoice.id });
  }

  static async handleInvoicePaymentSucceeded(invoice: Stripe.Invoice) {
    logger.info('Handling invoice payment succeeded', { invoiceId: invoice.id });

    await prisma.invoice.update({
      where: { stripeInvoiceId: invoice.id },
      data: {
        status: StripeInvoiceStatus.PAID,
        paidAt: new Date(),
      },
    });

    logger.info('Invoice payment succeeded processed', { invoiceId: invoice.id });
  }

  static async handleInvoicePaymentFailed(invoice: Stripe.Invoice) {
    logger.info('Handling invoice payment failed', { invoiceId: invoice.id });

    await prisma.invoice.update({
      where: { stripeInvoiceId: invoice.id },
      data: {
        status: StripeInvoiceStatus.OPEN, // Keep as open for retry
      },
    });

    // TODO: Send failed payment notification
    logger.info('Invoice payment failed processed', { invoiceId: invoice.id });
  }

  static async handlePaymentMethodAttached(paymentMethod: Stripe.PaymentMethod) {
    logger.info('Handling payment method attached', { paymentMethodId: paymentMethod.id });

    const userId = await this.getUserIdFromCustomer(paymentMethod.customer as string);
    if (!userId) {
      logger.warn('Payment method attached without valid customer', { paymentMethodId: paymentMethod.id });
      return;
    }

    await prisma.paymentMethod.create({
      data: {
        userId,
        stripeCustomerId: paymentMethod.customer as string,
        stripePaymentMethodId: paymentMethod.id,
        type: this.mapStripePaymentMethodType(paymentMethod.type),
        last4: paymentMethod.card?.last4,
        brand: paymentMethod.card?.brand,
        expiryMonth: paymentMethod.card?.exp_month,
        expiryYear: paymentMethod.card?.exp_year,
        isDefault: false, // Will be updated if set as default
      },
    });

    logger.info('Payment method attached processed', { paymentMethodId: paymentMethod.id });
  }

  static async handlePaymentMethodDetached(paymentMethod: Stripe.PaymentMethod) {
    logger.info('Handling payment method detached', { paymentMethodId: paymentMethod.id });

    await prisma.paymentMethod.delete({
      where: { stripePaymentMethodId: paymentMethod.id },
    });

    logger.info('Payment method detached processed', { paymentMethodId: paymentMethod.id });
  }

  static async handleTrialWillEnd(subscription: Stripe.Subscription) {
    logger.info('Handling trial will end', { subscriptionId: subscription.id });
    
    // TODO: Send trial ending notification
    logger.info('Trial will end processed', { subscriptionId: subscription.id });
  }

  static async getUserActiveSubscription(userId: number) {
    return await prisma.subscription.findFirst({
      where: { userId, status: SubscriptionStatus.ACTIVE },
    });
  }

  static async getUserSubscriptionWithDetails(userId: number) {
    const subscription = await prisma.subscription.findFirst({
      where: { userId },
      include: {
        invoices: {
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
      },
    });

    if (!subscription) {
      return null;
    }

    // Get payment methods for this user
    const paymentMethods = await prisma.paymentMethod.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });

    return {
      ...subscription,
      paymentMethods,
    };
  }

  static async updateSubscriptionPlan(userId: number, planType: string) {
    // TODO: Implement plan change logic with Stripe API
    throw new Error('Plan updates not yet implemented');
  }

  static async cancelSubscription(userId: number) {
    const subscription = await this.getUserActiveSubscription(userId);
    if (!subscription?.stripeSubscriptionId) {
      throw new Error('No active subscription found');
    }

    await stripe.subscriptions.update(subscription.stripeSubscriptionId, {
      cancel_at_period_end: true,
    });

    await prisma.subscription.update({
      where: { id: subscription.id },
      data: { cancelAtPeriodEnd: true },
    });
  }

  // Helper methods
  private static async getUserIdFromCustomer(customerId: string): Promise<number | null> {
    const subscription = await prisma.subscription.findFirst({
      where: { stripeCustomerId: customerId },
      select: { userId: true },
    });
    return subscription?.userId || null;
  }

  private static mapStripePriceToPlanType(priceId?: string): PlanType {
    if (!priceId) return PlanType.FREE;
    
    const { getPlanTypeFromPriceId } = require('../config/stripe.js');
    const planName = getPlanTypeFromPriceId(priceId);
    
    switch (planName) {
      case 'AI_REFEREE_FINDER':
        return PlanType.AI_REFEREE_FINDER;
      case 'OMNI_CHATS':
        return PlanType.OMNI_CHATS;
      case 'PREMIUM':
        return PlanType.PREMIUM;
      default:
        return PlanType.FREE;
    }
  }

  private static getBillingIntervalFromPriceId(priceId?: string): BillingInterval {
    if (!priceId) return BillingInterval.MONTHLY;
    
    const { getBillingIntervalFromPriceId } = require('../config/stripe.js');
    const interval = getBillingIntervalFromPriceId(priceId);
    
    switch (interval) {
      case 'annual':
        return BillingInterval.ANNUAL;
      case 'monthly':
      default:
        return BillingInterval.MONTHLY;
    }
  }

  private static mapStripeStatusToPrismaStatus(stripeStatus: string): SubscriptionStatus {
    const statusMap: Record<string, SubscriptionStatus> = {
      active: SubscriptionStatus.ACTIVE,
      canceled: SubscriptionStatus.CANCELED,
      incomplete: SubscriptionStatus.INCOMPLETE,
      incomplete_expired: SubscriptionStatus.INCOMPLETE_EXPIRED,
      past_due: SubscriptionStatus.PAST_DUE,
      trialing: SubscriptionStatus.TRIALING,
      unpaid: SubscriptionStatus.UNPAID,
    };
    return statusMap[stripeStatus] || SubscriptionStatus.INCOMPLETE;
  }

  private static mapStripeInvoiceStatusToPrismaStatus(stripeStatus: string | null): StripeInvoiceStatus {
    const statusMap: Record<string, StripeInvoiceStatus> = {
      draft: StripeInvoiceStatus.DRAFT,
      open: StripeInvoiceStatus.OPEN, 
      paid: StripeInvoiceStatus.PAID,
      uncollectible: StripeInvoiceStatus.UNCOLLECTIBLE,
      void: StripeInvoiceStatus.VOID,
    };
    return statusMap[stripeStatus || 'draft'] || StripeInvoiceStatus.DRAFT;
  }

  private static mapStripePaymentMethodType(type: string): PaymentMethodType {
    const typeMap: Record<string, PaymentMethodType> = {
      card: PaymentMethodType.CARD,
      us_bank_account: PaymentMethodType.BANK_ACCOUNT,
      paypal: PaymentMethodType.PAYPAL,
    };
    return typeMap[type] || PaymentMethodType.CARD;
  }

  private static async updateUserFeatureLimits(userId: number, planType: PlanType) {
    logger.info('Updating user feature limits', { userId, planType });
    
    // TODO: Implement feature limit updates based on plan type
    // This should integrate with your existing FeatureLimitsService
    
    // Example:
    // await FeatureLimitsService.updateUserPlan(userId, planType);
  }
}