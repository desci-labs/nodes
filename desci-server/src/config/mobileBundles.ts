export const MOBILE_CHAT_BUNDLE_PRODUCT_IDS = {
  CHAT_BUNDLE_10: 'com.desci.research.chatbundle10',
  CHAT_BUNDLE_30: 'com.desci.research.chatbundle30',
  CHAT_BUNDLE_200: 'com.desci.research.chatbundle200',
  LIFETIME: 'com.desci.research.lifetime',
} as const;

const CHAT_BUNDLE_GRANTS: Record<string, number> = {
  [MOBILE_CHAT_BUNDLE_PRODUCT_IDS.CHAT_BUNDLE_10]: 10,
  [MOBILE_CHAT_BUNDLE_PRODUCT_IDS.CHAT_BUNDLE_30]: 30,
  [MOBILE_CHAT_BUNDLE_PRODUCT_IDS.CHAT_BUNDLE_200]: 200,
};

export function getChatBundleUnitsForProduct(productId: string): number | null {
  return CHAT_BUNDLE_GRANTS[productId] ?? null;
}

export function isLifetimeMobileProduct(productId: string): boolean {
  return productId === MOBILE_CHAT_BUNDLE_PRODUCT_IDS.LIFETIME;
}

export function isRevenueCatBundleOrLifetimeProduct(productId: string): boolean {
  return getChatBundleUnitsForProduct(productId) !== null || isLifetimeMobileProduct(productId);
}
