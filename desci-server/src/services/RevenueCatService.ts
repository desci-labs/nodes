/**
 * RevenueCat service: customer info, subscription checks, cancel/delete for account lifecycle and webhooks.
 */
import { REVENUECAT_API_KEY, REVENUECAT_ENTITLEMENT_ID, REVENUECAT_WEBHOOK_SECRET } from '../config.js';
import { logger as parentLogger } from '../logger.js';
import { delFromCache, getFromCache, setToCache } from '../redisClient.js';

import { SubscriptionService } from './SubscriptionService.js';
import { getUserById } from './user.js';

const logger = parentLogger.child({ module: 'RevenueCatService' });

const REVENUECAT_API_URL = 'https://api.revenuecat.com/v1';

export const REVENUECAT_SUBSCRIPTION_CACHE_PREFIX = 'revenuecat:subscription:';

/** Customer info response from RevenueCat GET /subscribers/{app_user_id} */
type Store = 'play_store' | 'app_store' | (string & NonNullable<unknown>);

export interface RevenueCatCustomerInfo {
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
    non_subscriptions: Record<string, unknown>;
    original_app_user_id: string;
    original_application_version: string;
    original_purchase_date: string;
    other_purchases: Record<string, unknown>;
    subscriptions: {
      [productId: string]: {
        auto_resume_date: string | null;
        billing_issues_detected_at: string | null;
        expires_date: string | null;
        grace_period_expires_date: string | null;
        is_sandbox: boolean;
        original_purchase_date: string;
        ownership_type: string;
        period_type: string;
        purchase_date: string;
        refunded_at: string | null;
        store: Store;
        store_transaction_id: string | number;
        unsubscribe_detected_at: string | null;
        price: { amount: number; currency: string };
      };
    };
  };
}

export interface MobileSubscriptionDetails {
  userId: number;
  productId: string;
  expirationDate: string;
  purchaseDate: string;
  price: { amount: number; currency: string };
  store: string;
  storeTransactionId: string | number;
  unsubscribeDetectedAt: string | null;
}

export interface RevenueCatWebhookPayload {
  api_version: string;
  event: {
    app_user_id: string;
    event_timestamp_ms: number;
    expiration_at_ms: number;
    product_id: string;
    store: string;
    subscriber_attributes: {
      [key: string]: { updated_at_ms: number; value: string };
    };
    transaction_id: string | null;
    type: string;
  };
}

function getAuthHeaders(): Record<string, string> {
  if (!REVENUECAT_API_KEY?.trim()) {
    throw new Error('REVENUECAT_API_KEY is not set');
  }
  return {
    Authorization: `Bearer ${REVENUECAT_API_KEY}`,
    'Content-Type': 'application/json',
  };
}

/**
 * Get customer info for a RevenueCat app user id.
 */
export async function getCustomerInfo(appUserId: string): Promise<RevenueCatCustomerInfo | null> {
  try {
    const res = await fetch(`${REVENUECAT_API_URL}/subscribers/${encodeURIComponent(appUserId)}`, {
      headers: getAuthHeaders(),
    });
    if (res.status === 404) return null;
    if (!res.ok) {
      const text = await res.text();
      logger.warn({ appUserId, status: res.status, body: text }, 'RevenueCat getCustomerInfo failed');
      return null;
    }
    return (await res.json()) as RevenueCatCustomerInfo;
  } catch (err) {
    logger.error({ err, appUserId }, 'RevenueCat getCustomerInfo error');
    return null;
  }
}

/**
 * Check if the user has an active subscription (active entitlement).
 * Uses app_user_id = String(userId).
 */
export async function checkUserSubscription(userId: number): Promise<{
  hasActiveSubscription: boolean;
  customerInfo: RevenueCatCustomerInfo | null;
}> {
  const appUserId = String(userId);
  const customerInfo = await getCustomerInfo(appUserId);
  if (!customerInfo?.subscriber?.entitlements) {
    return { hasActiveSubscription: false, customerInfo };
  }
  const entitlement = customerInfo.subscriber.entitlements[REVENUECAT_ENTITLEMENT_ID];
  if (!entitlement) {
    return { hasActiveSubscription: false, customerInfo };
  }
  const expiresDate = entitlement.expires_date;
  const active = expiresDate ? new Date(expiresDate) > new Date() : false;
  return { hasActiveSubscription: active, customerInfo };
}

/**
 * Delete a subscriber from RevenueCat. Used for account deletion.
 */
export async function deleteSubscriber(appUserId: string): Promise<boolean> {
  try {
    const res = await fetch(`${REVENUECAT_API_URL}/subscribers/${encodeURIComponent(appUserId)}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    });
    if (res.status === 404) {
      logger.info({ appUserId }, 'RevenueCat subscriber already deleted');
      return true;
    }
    if (!res.ok) {
      const text = await res.text();
      logger.warn({ appUserId, status: res.status, body: text }, 'RevenueCat deleteSubscriber failed');
      return false;
    }
    logger.info({ appUserId }, 'RevenueCat subscriber deleted');
    return true;
  } catch (err) {
    logger.error({ err, appUserId }, 'RevenueCat deleteSubscriber error');
    return false;
  }
}

/**
 * Cancel a single subscription by store transaction id (RevenueCat API).
 */
async function cancelSubscriptionByStoreTransaction(
  appUserId: string,
  storeTransactionId: string | number,
): Promise<boolean> {
  const id = String(storeTransactionId);
  try {
    const res = await fetch(
      `${REVENUECAT_API_URL}/subscribers/${encodeURIComponent(appUserId)}/subscriptions/${encodeURIComponent(id)}/cancel`,
      {
        method: 'POST',
        headers: getAuthHeaders(),
      },
    );
    if (!res.ok && res.status !== 404) {
      const text = await res.text();
      logger.warn(
        { appUserId, storeTransactionId: id, status: res.status, body: text },
        'RevenueCat cancel subscription failed',
      );
      return false;
    }
    return true;
  } catch (err) {
    logger.error({ err, appUserId, storeTransactionId: id }, 'RevenueCat cancel subscription error');
    return false;
  }
}

/**
 * Cancel RevenueCat subscription for a user (e.g. account deletion).
 * Cancels active subscriptions via API when possible, then deletes the subscriber.
 * App user id is assumed to be String(userId).
 */
export async function cancelSubscriptionForUser(userId: number): Promise<void> {
  const appUserId = String(userId);
  const customerInfo = await getCustomerInfo(appUserId);
  if (customerInfo?.subscriber?.subscriptions) {
    for (const [productId, sub] of Object.entries(customerInfo.subscriber.subscriptions)) {
      const expiresDate = sub.expires_date;
      // only play_store subscriptions/purchases works via api, for app_store user has to cancel themselves
      // or we cancel on revenue cat dashboard
      if (expiresDate && new Date(expiresDate) > new Date() && sub.store === 'play_store') {
        await cancelSubscriptionByStoreTransaction(appUserId, sub.store_transaction_id);
      }
    }
  }
  await deleteSubscriber(appUserId);
  const cacheKey = `${REVENUECAT_SUBSCRIPTION_CACHE_PREFIX}${userId}`;
  await delFromCache(cacheKey);
}

async function cacheMobileSubscriptionFromCustomerInfo(
  userId: number,
  customerInfo: RevenueCatCustomerInfo,
): Promise<void> {
  const productId = customerInfo.subscriber.entitlements[REVENUECAT_ENTITLEMENT_ID]?.product_identifier;
  if (!productId) {
    logger.warn(
      { userId, entitlements: customerInfo.subscriber.entitlements, REVENUECAT_ENTITLEMENT_ID },
      'RevenueCat entitlement not found for cache',
    );
    return;
  }
  const subscriptions = customerInfo.subscriber.subscriptions;
  const subscription = subscriptions[productId];
  if (!subscription) {
    logger.warn({ productId, userId }, 'RevenueCat subscription not found for product');
    return;
  }
  const expires_date = subscription.expires_date;
  const details: MobileSubscriptionDetails = {
    userId,
    productId,
    price: subscription.price,
    expirationDate: expires_date ?? '',
    purchaseDate: subscription.purchase_date,
    store: subscription.store,
    storeTransactionId: subscription.store_transaction_id,
    unsubscribeDetectedAt: subscription.unsubscribe_detected_at,
  };
  const expirationMs = expires_date ? new Date(expires_date).getTime() : 0;
  const cacheDurationSeconds = expirationMs
    ? Math.max(60, Math.floor((expirationMs - Date.now()) / 1000))
    : 60 * 60 * 24;
  const cacheKey = `${REVENUECAT_SUBSCRIPTION_CACHE_PREFIX}${userId}`;
  await setToCache(cacheKey, details, cacheDurationSeconds);
  logger.info({ cacheDurationSeconds, userId }, 'RevenueCat mobile subscription cached');
}

/**
 * Handle an incoming webhook payload: validate user, fetch customer info, update SubscriptionService and cache.
 * Does not validate webhook secret; caller must do that.
 */
export async function handleWebhookEvent(
  payload: RevenueCatWebhookPayload,
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const userIdValue = payload.event.subscriber_attributes['userId']?.value;
  const userId = userIdValue ? Number(userIdValue) : null;
  const user = userId != null && !Number.isNaN(userId) ? await getUserById(userId) : null;
  if (!user) {
    logger.warn({ userId: userIdValue }, 'RevenueCat webhook: user not found');
    return { ok: false, status: 404, error: 'User not found' };
  }
  const appUserId = payload.event.app_user_id;

  const customerInfo = await getCustomerInfo(appUserId);
  if (customerInfo) {
    logger.info(
      { originalAppUserId: customerInfo.subscriber.original_app_user_id, appUserId },
      'RevenueCat webhook: customer info',
    );
  }

  const numUserId = Number(userId);
  switch (payload.event.type) {
    case 'INITIAL_PURCHASE':
      await SubscriptionService.handleMobileSubscriptionCreated(numUserId);
      if (customerInfo) await cacheMobileSubscriptionFromCustomerInfo(numUserId, customerInfo);
      break;
    case 'RENEWAL':
      await SubscriptionService.handleMobileSubscriptionRenewed(numUserId);
      if (customerInfo) await cacheMobileSubscriptionFromCustomerInfo(numUserId, customerInfo);
      break;
    case 'CANCELLATION':
      await SubscriptionService.handleMobileSubscriptionCancelled(numUserId);
      break;
    case 'EXPIRATION':
      await SubscriptionService.handleMobileSubscriptionCancelled(numUserId);
      break;
    default:
      logger.warn({ eventType: payload.event.type }, 'RevenueCat webhook: unknown event type');
      break;
  }

  return { ok: true };
}

/**
 * Verify webhook authorization header. Returns true if valid.
 */
export function verifyWebhookSecret(authorizationHeader: string | undefined): boolean {
  if (!REVENUECAT_WEBHOOK_SECRET?.trim()) {
    logger.error('REVENUECAT_WEBHOOK_SECRET is not set');
    return false;
  }
  return authorizationHeader === REVENUECAT_WEBHOOK_SECRET;
}

/**
 * Get cached mobile subscription details for a user, if any.
 */
export async function getCachedSubscription(userId: number): Promise<MobileSubscriptionDetails | null> {
  const key = `${REVENUECAT_SUBSCRIPTION_CACHE_PREFIX}${userId}`;
  return getFromCache<MobileSubscriptionDetails>(key);
}
