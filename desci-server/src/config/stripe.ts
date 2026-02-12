// Stripe configuration - Configurable via environment variables
export const STRIPE_PRICE_IDS = {
  AI_REFEREE_FINDER: {
    MONTHLY: process.env.STRIPE_AI_REFEREE_FINDER_MONTHLY_PRICE_ID || 'price_1ABC123example',
    ANNUAL: process.env.STRIPE_AI_REFEREE_FINDER_ANNUAL_PRICE_ID || 'price_1ABC123example_annual',
  },
  OMNI_CHATS: {
    MONTHLY: process.env.STRIPE_OMNI_CHATS_MONTHLY_PRICE_ID || 'price_1S0rAKAqadM33xzp9x5Rkww1',
    ANNUAL: process.env.STRIPE_OMNI_CHATS_ANNUAL_PRICE_ID || 'price_1SmxVFAqadM33xzpTGjdBBeA',
  },
  PREMIUM: {
    MONTHLY: process.env.STRIPE_PREMIUM_MONTHLY_PRICE_ID || 'price_3GHI789example',
    ANNUAL: process.env.STRIPE_PREMIUM_ANNUAL_PRICE_ID || 'price_3GHI789example_annual',
  },
  SCIWEAVE_LIFETIME: {
    LIFETIME: process.env.STRIPE_SCIWEAVE_LIFETIME_PRICE_ID || 'price_1SxHnFAqadM33xzpc9tBFWsQ',
  },
} as const;

export const PLAN_DETAILS = {
  // Doesn't determine actual prices, placeholders in place to avoid breaking changes.
  AI_REFEREE_FINDER: {
    name: 'Referee Finder Pro',
    planType: 'AI_REFEREE_FINDER' as const,
    features: ['AI-powered referee recommendations', 'Advanced filtering', 'Priority support'],
    pricing: {
      monthly: { price: '$45', interval: 'month' },
      annual: { price: '$450', interval: 'year', savings: '17%' }, // ~2 months free
    },
  },
  OMNI_CHATS: {
    name: 'SciWeave Chats',
    planType: 'OMNI_CHATS' as const,
    features: ['Unlimited chat conversations', 'Advanced AI models', 'Chat history'],
    pricing: {
      monthly: { price: '$9', interval: 'month' },
      annual: { price: '$90', interval: 'year', savings: '17%' }, // ~2 months free
    },
  },
  PREMIUM: {
    name: 'Premium Plan',
    planType: 'PREMIUM' as const,
    features: ['All features included', 'Priority support', 'Custom integrations'],
    pricing: {
      monthly: { price: '$99', interval: 'month' },
      annual: { price: '$990', interval: 'year', savings: '17%' }, // ~2 months free
    },
  },
  SCIWEAVE_LIFETIME: {
    name: 'SciWeave Lifetime',
    planType: 'SCIWEAVE_LIFETIME' as const,
    features: ['Lifetime access to SciWeave chats', 'Unlimited chat conversations', 'No recurring billing'],
    pricing: {
      lifetime: { price: '$999', interval: 'once' },
    },
  },
} as const;

export type PlanType = keyof typeof PLAN_DETAILS;

// Helper to get all price IDs in a flat array
export const ALL_STRIPE_PRICE_IDS = Object.values(STRIPE_PRICE_IDS).flatMap((plan) => Object.values(plan));

// Helper to determine billing interval from price ID
export function getBillingIntervalFromPriceId(priceId: string): 'monthly' | 'annual' | 'lifetime' | null {
  for (const prices of Object.values(STRIPE_PRICE_IDS)) {
    if ('MONTHLY' in prices && prices.MONTHLY === priceId) return 'monthly';
    if ('ANNUAL' in prices && prices.ANNUAL === priceId) return 'annual';
    if ('LIFETIME' in prices && prices.LIFETIME === priceId) return 'lifetime';
  }
  return null;
}

// Helper to get plan type from price ID
export function getPlanTypeFromPriceId(priceId: string): keyof typeof PLAN_DETAILS | null {
  for (const [planName, prices] of Object.entries(STRIPE_PRICE_IDS)) {
    if (Object.values(prices).includes(priceId)) {
      return planName as keyof typeof PLAN_DETAILS;
    }
  }
  return null;
}
