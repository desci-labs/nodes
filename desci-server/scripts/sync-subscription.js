import Stripe from 'stripe';
import { PrismaClient } from '@prisma/client';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const prisma = new PrismaClient();

async function syncSubscription(subscriptionId) {
  try {
    console.log('Fetching subscription from Stripe:', subscriptionId);
    
    // Get subscription from Stripe using direct API call
    const response = await fetch(`https://api.stripe.com/v1/subscriptions/${subscriptionId}`, {
      headers: {
        'Authorization': `Bearer ${process.env.STRIPE_SECRET_KEY}`
      }
    });
    const subscription = await response.json();
    
    console.log('Subscription status:', subscription.status);
    console.log('Current period start:', subscription.current_period_start);
    console.log('Current period end:', subscription.current_period_end);
    
    // Convert timestamps to dates
    const periodStart = subscription.current_period_start ? new Date(subscription.current_period_start * 1000) : null;
    const periodEnd = subscription.current_period_end ? new Date(subscription.current_period_end * 1000) : null;
    
    console.log('Period start date:', periodStart);
    console.log('Period end date:', periodEnd);

    // Get customer to find user ID
    const customerId = typeof subscription.customer === 'string' ? subscription.customer : subscription.customer.id;
    const customer = await stripe.customers.retrieve(customerId);
    console.log('Customer metadata:', customer.metadata);
    
    const userId = customer.metadata?.userId ? parseInt(customer.metadata.userId) : null;
    if (!userId) {
      console.error('No userId in customer metadata');
      return;
    }

    console.log('User ID:', userId);

    console.log('Checking for existing subscription in database...');

    // Map price ID to plan type
    const priceId = subscription.items.data[0]?.price.id;
    const planType = priceId?.includes('OMNI_CHATS') ? 'OMNI_CHATS' : 'PREMIUM';
    const billingInterval = priceId?.includes('annual') ? 'ANNUAL' : 'MONTHLY';

    console.log('Plan type:', planType, 'Billing interval:', billingInterval);

    // Check if subscription already exists and update it
    const existingSub = await prisma.subscription.findFirst({
      where: { stripeSubscriptionId: subscription.id }
    });

    let newSub;
    if (existingSub) {
      console.log('Updating existing subscription...');
      console.log('Current period start:', subscription.current_period_start, 'End:', subscription.current_period_end);
      newSub = await prisma.subscription.update({
        where: { id: existingSub.id },
        data: {
          status: subscription.status === 'active' ? 'ACTIVE' : 'INCOMPLETE',
          planType,
          billingInterval,
          stripePriceId: priceId,
          currentPeriodStart: periodStart,
          currentPeriodEnd: periodEnd,
          cancelAtPeriodEnd: subscription.cancel_at_period_end,
          trialStart: subscription.trial_start ? new Date(subscription.trial_start * 1000) : null,
          trialEnd: subscription.trial_end ? new Date(subscription.trial_end * 1000) : null,
        },
      });
    } else {
      console.log('Creating new subscription...');
      newSub = await prisma.subscription.create({
        data: {
          userId,
          stripeCustomerId: subscription.customer,
          stripeSubscriptionId: subscription.id,
          stripePriceId: priceId,
          status: subscription.status === 'active' ? 'ACTIVE' : 'INCOMPLETE',
          planType,
          billingInterval,
          currentPeriodStart: periodStart,
          currentPeriodEnd: periodEnd,
          cancelAtPeriodEnd: subscription.cancel_at_period_end,
          trialStart: subscription.trial_start ? new Date(subscription.trial_start * 1000) : null,
          trialEnd: subscription.trial_end ? new Date(subscription.trial_end * 1000) : null,
        },
      });
    }

    // Sync invoices for this subscription
    console.log('Syncing invoices...');
    const invoices = await stripe.invoices.list({
      customer: subscription.customer,
      subscription: subscription.id,
      limit: 10,
    });

    for (const invoice of invoices.data) {
      const existingInvoice = await prisma.invoice.findFirst({
        where: { stripeInvoiceId: invoice.id }
      });

      if (!existingInvoice) {
        await prisma.invoice.create({
          data: {
            userId,
            subscriptionId: newSub.id,
            stripeInvoiceId: invoice.id,
            amount: (invoice.amount_paid || 0) / 100,
            currency: invoice.currency,
            status: invoice.status === 'paid' ? 'PAID' : (invoice.status === 'open' ? 'OPEN' : 'DRAFT'),
            description: invoice.lines.data[0]?.description || 'Subscription payment',
            invoiceUrl: invoice.hosted_invoice_url,
            pdfUrl: invoice.invoice_pdf,
            dueDate: invoice.due_date ? new Date(invoice.due_date * 1000) : null,
            createdAt: new Date(invoice.created * 1000),
          },
        });
        console.log('Created invoice:', invoice.id);
      }
    }

    // Sync payment methods
    console.log('Syncing payment methods...');
    const paymentMethods = await stripe.paymentMethods.list({
      customer: subscription.customer,
      type: 'card',
    });

    for (const pm of paymentMethods.data) {
      const existingPM = await prisma.paymentMethod.findFirst({
        where: { stripePaymentMethodId: pm.id }
      });

      if (!existingPM) {
        await prisma.paymentMethod.create({
          data: {
            userId,
            stripeCustomerId: subscription.customer,
            stripePaymentMethodId: pm.id,
            type: 'CARD',
            last4: pm.card?.last4,
            brand: pm.card?.brand?.toUpperCase(),
            expiryMonth: pm.card?.exp_month,
            expiryYear: pm.card?.exp_year,
            isDefault: false, // TODO: Check if it's the default payment method
          },
        });
        console.log('Created payment method:', pm.id, pm.card?.brand, 'ending in', pm.card?.last4);
      }
    }

    console.log('✅ Subscription created successfully:', newSub.id);
    console.log('User', userId, 'now has', planType, 'subscription');
    
  } catch (error) {
    console.error('❌ Error syncing subscription:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

// Run with subscription ID
const subscriptionId = process.argv[2] || 'sub_1S0yNCAqadM33xzprVjg1dZe';
syncSubscription(subscriptionId);