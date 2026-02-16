import { Request, Response } from 'express';
import { errWithCause } from 'pino-std-serializers';

import { logger as parentLogger } from '../../logger.js';
import { setToCache } from '../../redisClient.js';
import { SubscriptionService } from '../../services/SubscriptionService.js';
import { getUserById } from '../../services/user.js';

const logger = parentLogger.child({
  module: 'REVENUECAT_WEBHOOK',
});

const endpointSecret = process.env.REVENUECAT_WEBHOOK_SECRET ?? 'test-jwt-header';
const REVENUECAT_API_KEY = 'sk_bvBINEhKMOnpaFaXWNxaoXSOcXLDX'; // process.env.REVENUECAT_API_KEY ??
const REVENUECAT_API_URL = 'https://api.revenuecat.com/v1';

interface RevenueCatWebhookPayload {
  api_version: '1.0' | '2.0' | (string & object);
  event: {
    aliases: string[];
    app_id: string;
    app_user_id: string;
    commission_percentage: number | null;
    country_code: string;
    currency: string | null;
    entitlement_id: string | null;
    entitlement_ids: string[] | null;
    environment: string;
    event_timestamp_ms: number;
    expiration_at_ms: number;
    id: string;
    is_family_share: boolean | null;
    metadata: Record<string, any> | null;
    offer_code: string | null;
    original_app_user_id: string;
    original_transaction_id: string | null;
    period_type: string;
    presented_offering_id: string | null;
    price: number | null;
    price_in_purchased_currency: number | null;
    product_id: string;
    purchased_at_ms: number;
    renewal_number: number | null;
    store: string;
    subscriber_attributes: {
      [key: string]: {
        updated_at_ms: number;
        value: string;
      };
    };
    takehome_percentage: number | null;
    tax_percentage: number | null;
    transaction_id: string | null;
    type: string;
  };
}

interface CustomerInfoV1 {
  request_date: string;
  request_date_ms: number;
  subscriber: {
    entitlements: {
      [entitlementId: string]: {
        expires_date: string | null;
        grace_period_expires_date: string | null;
        product_identifier: string;
        purchase_date: string;
      };
    };
    first_seen: string;
    management_url: string;
    non_subscriptions: {
      [productId: string]: Array<{
        id: string;
        is_sandbox: boolean;
        purchase_date: string;
        store: string;
      }>;
    };
    original_app_user_id: string;
    original_application_version: string;
    original_purchase_date: string;
    other_purchases: {
      [productId: string]: unknown;
    };
    subscriptions: {
      [productId: string]: {
        auto_resume_date: string | null;
        billing_issues_detected_at: string | null;
        expires_date: string | null;
        grace_period_expires_date: string | null;
        is_sandbox: boolean;
        original_purchase_date: string;
        ownership_type: 'PURCHASED' | 'FAMILY_SHARED' | string;
        period_type: string;
        purchase_date: string;
        refunded_at: string | null;
        store: string;
        store_transaction_id: string | number;
        unsubscribe_detected_at: string | null;
        price: {
          amount: number;
          currency: string;
        };
      };
    };
  };
}

export interface MobileSubscriptionDetails {
  userId: number;
  productId: string;
  expirationDate: string;
  purchaseDate: string;
  price: {
    amount: number;
    currency: string;
  };
  store: string;
  storeTransactionId: string | number;
  unsubscribeDetectedAt: string | null;
}

export const REVENUECAT_SUBSCRIPTION_CACHE_PREFIX = 'revenuecat:subscription:';
export const REVENUECAT_ENTITLEMENT_ID = process.env.REVENUECAT_ENTITLEMENT_ID ?? 'Sciweave Pro';

const cacheMobileSubscription = async (userId: number, customerInfo: CustomerInfoV1) => {
  const cacheKey = `${REVENUECAT_SUBSCRIPTION_CACHE_PREFIX}${userId}`;
  const productId = customerInfo.subscriber.entitlements[REVENUECAT_ENTITLEMENT_ID]?.product_identifier;
  if (!productId) {
    logger.error('REVENUECAT_ENTITLEMENT_ID not found');
    return;
  }
  const mobileSubscriptionDetails: MobileSubscriptionDetails = {
    userId,
    productId,
    price: customerInfo.subscriber.subscriptions[productId].price,
    expirationDate: customerInfo.subscriber.subscriptions[productId].expires_date,
    purchaseDate: customerInfo.subscriber.subscriptions[productId].purchase_date,
    store: customerInfo.subscriber.subscriptions[productId].store,
    storeTransactionId: customerInfo.subscriber.subscriptions[productId].store_transaction_id,
    unsubscribeDetectedAt: customerInfo.subscriber.subscriptions[productId].unsubscribe_detected_at,
  };
  const cacheDuration = Math.round((new Date(mobileSubscriptionDetails.expirationDate).getTime() - Date.now()) / 1000); // in seconds
  logger.info({ cacheDuration, mobileSubscriptionDetails }, 'Caching mobile subscription details');
  await setToCache(cacheKey, mobileSubscriptionDetails, cacheDuration);
};

export const handleRevenueCatWebhook = async (req: Request, res: Response) => {
  logger.info('Received RevenueCat webhook');
  const sig = req.headers['authorization'];

  try {
    if (endpointSecret !== sig) {
      logger.error('REVENUECAT_WEBHOOK_SECRET not configured');
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    res.status(200).json({ received: true });
    // return;
  } catch (err: any) {
    logger.error({ error: err.message }, 'Webhook signature verification failed');
    res.status(400).json({ error: 'Webhook signature verification failed' });
    return;
  }

  try {
    const payload = req.body as RevenueCatWebhookPayload;
    logger.info({ payload: payload }, 'Received RevenueCat webhook');
    const userId = payload.event.subscriber_attributes['userId']?.value;
    // check if user exists
    const user = userId ? await getUserById(Number(userId)) : null;
    if (!user) {
      logger.error({ userId }, 'User not found');
      res.status(404).json({ error: 'User not found' });
      return;
    }
    // const email = payload.event.subscriber_attributes['email'].value;
    const appUserId = payload.event.app_user_id;

    const getCustomerInfo = await fetch(`${REVENUECAT_API_URL}/subscribers/${appUserId}`, {
      headers: {
        Authorization: `Bearer ${REVENUECAT_API_KEY}`,
      },
    });
    const customerInfo = (await getCustomerInfo.json()) as CustomerInfoV1;
    logger.info({ customerInfo: customerInfo }, 'Customer info');

    switch (payload.event.type) {
      case 'INITIAL_PURCHASE':
        await SubscriptionService.handleMobileSubscriptionCreated(Number(userId));
        await cacheMobileSubscription(Number(userId), customerInfo);
        break;
      case 'RENEWAL':
        await SubscriptionService.handleMobileSubscriptionRenewed(Number(userId));
        await cacheMobileSubscription(Number(userId), customerInfo);
        break;
      case 'CANCELLATION':
        await SubscriptionService.handleMobileSubscriptionCancelled(Number(userId));
        break;
      case 'EXPIRATION':
        await SubscriptionService.handleMobileSubscriptionCancelled(Number(userId));
        break;
      default:
        logger.warn({ eventType: payload.event.type }, 'Unknown event type');
        break;
    }
  } catch (err: any) {
    logger.error({ err: errWithCause(err) }, 'Error handling RevenueCat webhook');
  }
};
