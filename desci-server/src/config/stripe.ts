// Stripe configuration - Replace with your actual price IDs from Stripe Dashboard
export const STRIPE_PRICE_IDS = {
  AI_REFEREE_FINDER: {
    MONTHLY: 'price_1ABC123example', // Replace with your actual price ID for $45/month
    ANNUAL: 'price_1ABC123example_annual', // Replace with your actual price ID for $450/year (annual)
  },
  OMNI_CHATS: {
    MONTHLY: 'price_1S0rAKAqadM33xzp9x5Rkww1', // $9/month - confirmed working price
    ANNUAL: 'price_1S0sHWAqadM33xzp6wNaaRe3', // Annual price - verify this exists in Stripe
  },
  PREMIUM: {
    MONTHLY: 'price_3GHI789example', // Replace with your actual price ID for $99/month
    ANNUAL: 'price_3GHI789example_annual', // Replace with your actual price ID for $990/year (annual)
  },
} as const;

export const PLAN_DETAILS = {
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
} as const;

export type PlanType = keyof typeof PLAN_DETAILS;

// Helper to get all price IDs in a flat array
export const ALL_STRIPE_PRICE_IDS = Object.values(STRIPE_PRICE_IDS).flatMap((plan) => [plan.MONTHLY, plan.ANNUAL]);

// Helper to determine billing interval from price ID
export function getBillingIntervalFromPriceId(priceId: string): 'monthly' | 'annual' | null {
  for (const [planName, prices] of Object.entries(STRIPE_PRICE_IDS)) {
    if (prices.MONTHLY === priceId) return 'monthly';
    if (prices.ANNUAL === priceId) return 'annual';
  }
  return null;
}

// Helper to get plan type from price ID
export function getPlanTypeFromPriceId(priceId: string): keyof typeof PLAN_DETAILS | null {
  for (const [planName, prices] of Object.entries(STRIPE_PRICE_IDS)) {
    if (prices.MONTHLY === priceId || prices.ANNUAL === priceId) {
      return planName as keyof typeof PLAN_DETAILS;
    }
  }
  return null;
}
