# Stripe Integration Setup Guide

This guide will help you complete the Stripe integration for SciWeave billing with support for both monthly and annual billing options.

## Prerequisites

- Stripe account with Dashboard access
- Environment variables properly configured
- Database migration completed

## Setup Checklist

### 1. Create Stripe Products and Prices

In your Stripe Dashboard, create products with BOTH monthly and annual pricing:

#### Product: AI Referee Finder
- **Monthly Price**: Create recurring price with 1-month interval
- **Annual Price**: Create recurring price with 1-year interval
- Copy both price IDs (format: `price_xxxxx...`)

#### Product: Omni Chats  
- **Monthly Price**: Create recurring price with 1-month interval
- **Annual Price**: Create recurring price with 1-year interval
- Copy both price IDs

#### Product: Premium
- **Monthly Price**: Create recurring price with 1-month interval  
- **Annual Price**: Create recurring price with 1-year interval
- Copy both price IDs

### 2. Update Price ID Configuration

Edit `/desci-server/src/config/stripe.ts` and replace the example price IDs:

```typescript
export const STRIPE_PRICE_IDS = {
  AI_REFEREE_FINDER: {
    MONTHLY: 'price_YOUR_ACTUAL_MONTHLY_PRICE_ID',  // ← Replace this
    ANNUAL: 'price_YOUR_ACTUAL_ANNUAL_PRICE_ID',    // ← Replace this
  },
  OMNI_CHATS: {
    MONTHLY: 'price_YOUR_ACTUAL_MONTHLY_PRICE_ID',  // ← Replace this
    ANNUAL: 'price_YOUR_ACTUAL_ANNUAL_PRICE_ID',    // ← Replace this
  },
  PREMIUM: {
    MONTHLY: 'price_YOUR_ACTUAL_MONTHLY_PRICE_ID',  // ← Replace this
    ANNUAL: 'price_YOUR_ACTUAL_ANNUAL_PRICE_ID',    // ← Replace this
  },
};
```

### 3. Configure Environment Variables

Add these to your `.env` file:

```bash
# Stripe Configuration
STRIPE_SECRET_KEY=sk_test_xxxxx...  # Your secret key
STRIPE_WEBHOOK_SECRET=whsec_xxxxx...  # Webhook endpoint secret
```

### 4. Set Up Webhook Endpoint

1. In Stripe Dashboard → Developers → Webhooks
2. Add endpoint: `https://your-domain.com/v1/stripe/webhook`
3. Select these events:
   - `customer.created`
   - `customer.subscription.created`
   - `customer.subscription.updated` 
   - `customer.subscription.deleted`
   - `invoice.created`
   - `invoice.payment_succeeded`
   - `invoice.payment_failed`
   - `payment_method.attached`
   - `payment_method.detached`
4. Copy the webhook signing secret

### 5. Run Database Migration

```bash
cd desci-server
npx prisma migrate dev --name add_billing_interval_support
npx prisma generate
```

### 6. Update Pricing Display (Optional)

The configuration includes example pricing. Update the `pricing` section in `/desci-server/src/config/stripe.ts` to match your actual prices:

```typescript
pricing: {
  monthly: { amount: 29, currency: 'USD' },
  annual: { amount: 290, currency: 'USD', savings: '17%' },
}
```

### 7. Test the Integration

#### Test Monthly Subscription:
```bash
curl -X POST https://your-domain.com/v1/stripe/subscription/checkout \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "priceId": "price_monthly_ai_referee_finder",
    "successUrl": "https://your-domain.com/success",
    "cancelUrl": "https://your-domain.com/cancel"
  }'
```

#### Test Annual Subscription:
```bash
curl -X POST https://your-domain.com/v1/stripe/subscription/checkout \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "priceId": "price_annual_ai_referee_finder",
    "successUrl": "https://your-domain.com/success", 
    "cancelUrl": "https://your-domain.com/cancel"
  }'
```

#### Get Available Pricing Options:
```bash
curl https://your-domain.com/v1/stripe/pricing
```

### 8. Frontend Integration

The pricing API endpoint returns both monthly and annual options:

```typescript
// Example API response from /v1/stripe/pricing
{
  "plans": [
    {
      "planName": "AI_REFEREE_FINDER",
      "name": "AI Referee Finder", 
      "planType": "AI_REFEREE_FINDER",
      "features": ["AI-powered referee recommendations", "Advanced analytics"],
      "pricing": {
        "monthly": { "amount": 29, "currency": "USD" },
        "annual": { "amount": 290, "currency": "USD", "savings": "17%" }
      },
      "priceIds": {
        "MONTHLY": "price_monthly_ai_referee_finder",
        "ANNUAL": "price_annual_ai_referee_finder" 
      }
    }
  ]
}
```

## Verification Steps

1. ✅ Stripe products and prices created (both monthly and annual)
2. ✅ Price IDs updated in config file
3. ✅ Environment variables set
4. ✅ Webhook endpoint configured and tested
5. ✅ Database migration completed
6. ✅ Test subscriptions work for both billing intervals
7. ✅ Billing interval properly detected and stored in database

## Architecture Notes

- **Backend**: Handles webhooks, database operations, subscription management
- **Frontend**: Makes API calls to backend, no direct Stripe integration
- **Billing Detection**: Automatically detects monthly vs annual from Stripe price IDs
- **Database**: Tracks `billingInterval` field alongside subscription data

## Troubleshooting

### Price ID Mapping Issues
- Ensure price IDs in config exactly match your Stripe Dashboard
- Check that helper functions in `stripe.ts` are working correctly

### Webhook Verification Failures  
- Verify webhook secret matches Stripe Dashboard
- Ensure raw body parsing is enabled for webhook endpoint

### Database Issues
- Run `npx prisma db push` if migration fails
- Check that `BillingInterval` enum is properly added

Your Stripe integration with monthly and annual billing support is now complete! 🎉