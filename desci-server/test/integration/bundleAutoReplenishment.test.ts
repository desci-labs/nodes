import { Feature, PaymentMethodType, StripeCheckoutFulfillmentType, User } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const stripeMock = {
  customers: {
    retrieve: vi.fn(),
    update: vi.fn(),
  },
  prices: {
    retrieve: vi.fn(),
  },
  paymentIntents: {
    create: vi.fn(),
    retrieve: vi.fn(),
  },
  paymentMethods: {
    list: vi.fn(),
    retrieve: vi.fn(),
  },
};

vi.mock('../../src/utils/stripe.js', () => ({
  getStripe: () => stripeMock,
}));

import { prisma } from '../../src/client.js';
import { SCIWEAVE_FREE_LIMIT } from '../../src/config.js';
import { SubscriptionService } from '../../src/services/SubscriptionService.js';

describe('Bundle auto-replenishment', () => {
  let user: User;

  beforeEach(async () => {
    vi.clearAllMocks();

    await prisma.$queryRaw`TRUNCATE TABLE "BundleAutoReplenishment" CASCADE;`;
    await prisma.$queryRaw`TRUNCATE TABLE "StripeCheckoutFulfillment" CASCADE;`;
    await prisma.$queryRaw`TRUNCATE TABLE "PaymentMethod" CASCADE;`;
    await prisma.$queryRaw`TRUNCATE TABLE "Subscription" CASCADE;`;
    await prisma.$queryRaw`TRUNCATE TABLE "UserFeatureLimit" CASCADE;`;
    await prisma.$queryRaw`TRUNCATE TABLE "User" CASCADE;`;

    user = await prisma.user.create({
      data: {
        email: 'bundle-auto-replenishment-test@desci.com',
        name: 'Bundle Auto Replenishment Test User',
        stripeUserId: 'cus_bundle_auto_123',
      },
    });

    stripeMock.customers.retrieve.mockResolvedValue({
      id: 'cus_bundle_auto_123',
      deleted: false,
      invoice_settings: {
        default_payment_method: 'pm_bundle_default_123',
      },
    });
    stripeMock.customers.update.mockResolvedValue({});
    stripeMock.paymentMethods.list.mockResolvedValue({ data: [] });
  });

  it('enables auto-replenishment for a user with a previous bundle and saved card', async () => {
    await prisma.stripeCheckoutFulfillment.create({
      data: {
        userId: user.id,
        stripeSessionId: 'cs_bundle_30',
        stripePriceId: 'price_bundle_30',
        stripePaymentIntentId: 'pi_bundle_30',
        stripeCustomerId: 'cus_bundle_auto_123',
        fulfillmentType: StripeCheckoutFulfillmentType.BUNDLE_CHATS,
        purchasedUnits: 30,
        grantedUnits: 30,
      },
    });

    await prisma.paymentMethod.create({
      data: {
        userId: user.id,
        stripeCustomerId: 'cus_bundle_auto_123',
        stripePaymentMethodId: 'pm_bundle_default_123',
        type: PaymentMethodType.CARD,
        isDefault: true,
        brand: 'visa',
        last4: '4242',
        expiryMonth: 12,
        expiryYear: 2030,
      },
    });

    const status = await SubscriptionService.updateBundleAutoReplenishment(user.id, {
      enabled: true,
    });

    expect(status.enabled).toBe(true);
    expect(status.threshold).toBe(5);
    expect(status.latestBundlePurchase?.purchasedUnits).toBe(30);
    expect(status.hasSavedPaymentMethod).toBe(true);
  });

  it('charges the most recently purchased bundle when remaining chats reach the threshold', async () => {
    await prisma.bundleAutoReplenishment.create({
      data: {
        userId: user.id,
        isEnabled: true,
        threshold: 5,
      },
    });

    await prisma.stripeCheckoutFulfillment.createMany({
      data: [
        {
          userId: user.id,
          stripeSessionId: 'cs_bundle_old',
          stripePriceId: 'price_bundle_10',
          stripePaymentIntentId: 'pi_bundle_old',
          stripeCustomerId: 'cus_bundle_auto_123',
          fulfillmentType: StripeCheckoutFulfillmentType.BUNDLE_CHATS,
          purchasedUnits: 10,
          grantedUnits: 10,
          fulfilledAt: new Date('2026-05-01T00:00:00Z'),
        },
        {
          userId: user.id,
          stripeSessionId: 'cs_bundle_latest',
          stripePriceId: 'price_bundle_30',
          stripePaymentIntentId: 'pi_bundle_latest',
          stripeCustomerId: 'cus_bundle_auto_123',
          fulfillmentType: StripeCheckoutFulfillmentType.BUNDLE_CHATS,
          purchasedUnits: 30,
          grantedUnits: 30,
          fulfilledAt: new Date('2026-05-10T00:00:00Z'),
        },
      ],
    });

    await prisma.paymentMethod.create({
      data: {
        userId: user.id,
        stripeCustomerId: 'cus_bundle_auto_123',
        stripePaymentMethodId: 'pm_bundle_default_123',
        type: PaymentMethodType.CARD,
        isDefault: true,
      },
    });

    stripeMock.prices.retrieve.mockResolvedValue({
      id: 'price_bundle_30',
      unit_amount: 999,
      currency: 'usd',
      metadata: {
        bundle_chats: '30',
      },
    });
    stripeMock.paymentIntents.create.mockResolvedValue({
      id: 'pi_auto_replenishment_123',
      status: 'succeeded',
    });

    const triggered = await SubscriptionService.triggerBundleAutoReplenishmentIfNeeded({
      userId: user.id,
      remainingUses: 5,
    });

    expect(triggered).toBe(true);
    expect(stripeMock.paymentIntents.create).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 999,
        customer: 'cus_bundle_auto_123',
        payment_method: 'pm_bundle_default_123',
        metadata: expect.objectContaining({
          priceId: 'price_bundle_30',
          bundleChats: '30',
          type: 'bundle_auto_replenishment',
        }),
      }),
    );

    const settings = await prisma.bundleAutoReplenishment.findUnique({
      where: { userId: user.id },
    });
    expect(settings?.replenishmentInProgress).toBe(true);
  });

  it('fulfills a successful auto-replenishment payment intent and clears the in-progress flag', async () => {
    await prisma.bundleAutoReplenishment.create({
      data: {
        userId: user.id,
        isEnabled: true,
        threshold: 5,
        replenishmentInProgress: true,
      },
    });

    const handled = await SubscriptionService.handleBundleAutoReplenishmentSucceeded({
      id: 'pi_auto_success_123',
      amount: 999,
      amount_received: 999,
      currency: 'usd',
      customer: 'cus_bundle_auto_123',
      metadata: {
        type: 'bundle_auto_replenishment',
        userId: String(user.id),
        priceId: 'price_bundle_30',
        bundleChats: '30',
        quantity: '1',
      },
    } as any);

    expect(handled).toBe(true);

    const activeLimit = await prisma.userFeatureLimit.findFirst({
      where: { userId: user.id, feature: Feature.RESEARCH_ASSISTANT, isActive: true },
      orderBy: { createdAt: 'desc' },
    });
    expect(activeLimit?.useLimit).toBe(SCIWEAVE_FREE_LIMIT + 30);

    const fulfillment = await prisma.stripeCheckoutFulfillment.findUnique({
      where: { stripeSessionId: 'auto_replenishment:pi_auto_success_123' },
    });
    expect(fulfillment?.stripePriceId).toBe('price_bundle_30');
    expect(fulfillment?.grantedUnits).toBe(30);

    const settings = await prisma.bundleAutoReplenishment.findUnique({
      where: { userId: user.id },
    });
    expect(settings?.replenishmentInProgress).toBe(false);
    expect(settings?.lastSucceededAt).not.toBeNull();
  });
});
