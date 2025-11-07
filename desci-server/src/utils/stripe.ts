import Stripe from 'stripe';

import { logger as parentLogger } from '../logger.js';

const logger = parentLogger.child({
  module: 'STRIPE_UTILS',
});

let stripeInstance: Stripe | null = null;
let isStripeConfigured = false;

function initializeStripe(): void {
  const secretKey = process.env.STRIPE_SECRET_KEY;

  if (secretKey) {
    try {
      stripeInstance = new Stripe(secretKey);
      isStripeConfigured = true;
      logger.info('Stripe initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize Stripe', { error: error instanceof Error ? error.message : 'Unknown error' });
      isStripeConfigured = false;
    }
  } else {
    logger.warn('STRIPE_SECRET_KEY not found - Stripe features will be disabled');
    isStripeConfigured = false;
  }
}

export function getStripe(): Stripe {
  if (!isStripeConfigured || !stripeInstance) {
    throw new Error('Stripe is not configured. Please set STRIPE_SECRET_KEY environment variable.');
  }
  return stripeInstance;
}

export function isStripeEnabled(): boolean {
  return isStripeConfigured && stripeInstance !== null;
}

export function requireStripe(req: any, res: any, next: any): void {
  if (!isStripeEnabled()) {
    return res.status(500).json({
      error: 'Stripe service unavailable',
      message: 'Stripe is not configured on this server',
    });
  }
  next();
}

initializeStripe();
