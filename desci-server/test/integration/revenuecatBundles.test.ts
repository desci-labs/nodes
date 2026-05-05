import { Feature, PlanType, RevenueCatPurchaseFulfillmentType, SubscriptionStatus, User } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/services/email/email.js', () => ({
  sendEmail: vi.fn().mockResolvedValue(undefined),
}));

import { prisma } from '../../src/client.js';
import { MOBILE_CHAT_BUNDLE_PRODUCT_IDS } from '../../src/config/mobileBundles.js';
import { SCIWEAVE_FREE_LIMIT } from '../../src/config.js';
import { handleWebhookEvent, type RevenueCatWebhookPayload } from '../../src/services/RevenueCatService.js';

describe('RevenueCat bundle fulfillment', () => {
  let user: User;

  beforeEach(async () => {
    await prisma.$queryRaw`TRUNCATE TABLE "RevenueCatPurchaseFulfillment" CASCADE;`;
    await prisma.$queryRaw`TRUNCATE TABLE "Subscription" CASCADE;`;
    await prisma.$queryRaw`TRUNCATE TABLE "UserFeatureLimit" CASCADE;`;
    await prisma.$queryRaw`TRUNCATE TABLE "User" CASCADE;`;

    user = await prisma.user.create({
      data: {
        email: 'revenuecat-bundles-test@desci.com',
        name: 'RevenueCat Bundles Test User',
      },
    });
  });

  it('grants chats for a bundle purchase webhook', async () => {
    const result = await handleWebhookEvent(
      makePayload({
        userId: user.id,
        type: 'NON_RENEWING_PURCHASE',
        productId: MOBILE_CHAT_BUNDLE_PRODUCT_IDS.CHAT_BUNDLE_10,
        transactionId: 'bundle_txn_10',
        price: 4.99,
      }),
    );

    expect(result).toEqual({ ok: true });

    const activeLimit = await prisma.userFeatureLimit.findFirst({
      where: { userId: user.id, feature: Feature.RESEARCH_ASSISTANT, isActive: true },
      orderBy: { createdAt: 'desc' },
    });
    expect(activeLimit?.useLimit).toBe(SCIWEAVE_FREE_LIMIT + 10);

    const fulfillment = await prisma.revenueCatPurchaseFulfillment.findUnique({
      where: { revenueCatTransactionId: 'bundle_txn_10' },
    });
    expect(fulfillment?.fulfillmentType).toBe(RevenueCatPurchaseFulfillmentType.BUNDLE_CHATS);
    expect(fulfillment?.grantedUnits).toBe(10);
    expect(fulfillment?.purchasedUnits).toBe(10);
  });

  it('is idempotent for duplicate bundle webhooks', async () => {
    const payload = makePayload({
      userId: user.id,
      type: 'NON_RENEWING_PURCHASE',
      productId: MOBILE_CHAT_BUNDLE_PRODUCT_IDS.CHAT_BUNDLE_30,
      transactionId: 'bundle_txn_duplicate',
      price: 9.99,
    });

    await handleWebhookEvent(payload);
    await handleWebhookEvent(payload);

    const activeLimit = await prisma.userFeatureLimit.findFirst({
      where: { userId: user.id, feature: Feature.RESEARCH_ASSISTANT, isActive: true },
      orderBy: { createdAt: 'desc' },
    });
    expect(activeLimit?.useLimit).toBe(SCIWEAVE_FREE_LIMIT + 30);

    const fulfillments = await prisma.revenueCatPurchaseFulfillment.findMany({
      where: { revenueCatTransactionId: 'bundle_txn_duplicate' },
    });
    expect(fulfillments).toHaveLength(1);
  });

  it('reverses a bundle grant on cancellation', async () => {
    const transactionId = 'bundle_txn_cancel';

    await handleWebhookEvent(
      makePayload({
        userId: user.id,
        type: 'NON_RENEWING_PURCHASE',
        productId: MOBILE_CHAT_BUNDLE_PRODUCT_IDS.CHAT_BUNDLE_30,
        transactionId,
        price: 9.99,
      }),
    );

    await handleWebhookEvent(
      makePayload({
        userId: user.id,
        type: 'CANCELLATION',
        productId: MOBILE_CHAT_BUNDLE_PRODUCT_IDS.CHAT_BUNDLE_30,
        transactionId,
        cancelReason: 'CUSTOMER_SUPPORT',
      }),
    );

    const activeLimit = await prisma.userFeatureLimit.findFirst({
      where: { userId: user.id, feature: Feature.RESEARCH_ASSISTANT, isActive: true },
      orderBy: { createdAt: 'desc' },
    });
    expect(activeLimit?.useLimit).toBe(SCIWEAVE_FREE_LIMIT);

    const fulfillment = await prisma.revenueCatPurchaseFulfillment.findUnique({
      where: { revenueCatTransactionId: transactionId },
    });
    expect(fulfillment?.reversedAt).not.toBeNull();
    expect(fulfillment?.reversalReason).toBe('CUSTOMER_SUPPORT');
  });

  it('grants lifetime access for the lifetime product', async () => {
    const transactionId = 'lifetime_txn_1';

    const result = await handleWebhookEvent(
      makePayload({
        userId: user.id,
        type: 'NON_RENEWING_PURCHASE',
        productId: MOBILE_CHAT_BUNDLE_PRODUCT_IDS.LIFETIME,
        transactionId,
        price: 199.99,
      }),
    );

    expect(result).toEqual({ ok: true });

    const activeLimit = await prisma.userFeatureLimit.findFirst({
      where: { userId: user.id, feature: Feature.RESEARCH_ASSISTANT, isActive: true },
      orderBy: { createdAt: 'desc' },
    });
    expect(activeLimit?.useLimit).toBeNull();

    const subscription = await prisma.subscription.findFirst({
      where: { stripeSubscriptionId: `revenuecat_lifetime_${transactionId}` },
    });
    expect(subscription?.planType).toBe(PlanType.SCIWEAVE_LIFETIME);
    expect(subscription?.status).toBe(SubscriptionStatus.ACTIVE);

    const fulfillment = await prisma.revenueCatPurchaseFulfillment.findUnique({
      where: { revenueCatTransactionId: transactionId },
    });
    expect(fulfillment?.fulfillmentType).toBe(RevenueCatPurchaseFulfillmentType.LIFETIME_UNLOCK);
  });
});

function makePayload({
  userId,
  type,
  productId,
  transactionId,
  price,
  cancelReason,
}: {
  userId: number;
  type: string;
  productId: string;
  transactionId: string;
  price?: number;
  cancelReason?: string;
}): RevenueCatWebhookPayload {
  const now = Date.now();

  return {
    api_version: '1.0',
    event: {
      app_user_id: String(userId),
      cancel_reason: cancelReason ?? null,
      currency: 'USD',
      event_timestamp_ms: now,
      expiration_at_ms: now,
      id: `${transactionId}_${type.toLowerCase()}`,
      original_transaction_id: transactionId,
      presented_offering_id: 'chat_bundles',
      price: price ?? null,
      product_id: productId,
      store: 'PLAY_STORE',
      subscriber_attributes: {
        userId: {
          updated_at_ms: now,
          value: String(userId),
        },
      },
      transaction_id: transactionId,
      type,
    },
  };
}
