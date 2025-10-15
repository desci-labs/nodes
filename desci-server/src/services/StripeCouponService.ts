import { STRIPE_STUDENT_DISCOUNT_COUPON_ID } from '../config.js';
import { logger as parentLogger } from '../logger.js';
import { getStripe } from '../utils/stripe.js';

const logger = parentLogger.child({ module: 'StripeCouponService' });

/**
 * Stripe Coupon Service
 *
 * Manages coupon creation and retrieval for promotional offers.
 */

export interface CouponInfo {
  id: string;
  code: string;
  percentOff?: number;
  amountOff?: number;
  currency?: string;
  expiresAt?: Date;
}

export const StripeCouponService = {
  /**
   * Get the student discount coupon code
   * This is a persistent coupon created in the Stripe dashboard
   */
  getStudentDiscountCoupon: async (): Promise<CouponInfo> => {
    if (!STRIPE_STUDENT_DISCOUNT_COUPON_ID) {
      throw new Error(
        'STRIPE_STUDENT_DISCOUNT_COUPON_ID is not configured. Please create a student discount coupon in Stripe and set the environment variable.',
      );
    }

    try {
      const stripe = getStripe();
      const coupon = await stripe.coupons.retrieve(STRIPE_STUDENT_DISCOUNT_COUPON_ID);

      logger.info({ couponId: coupon.id }, 'Retrieved student discount coupon');

      return {
        id: coupon.id,
        code: coupon.id, // For direct coupon application
        percentOff: coupon.percent_off ?? undefined,
        amountOff: coupon.amount_off ?? undefined,
        currency: coupon.currency ?? undefined,
      };
    } catch (error) {
      logger.error(
        { error, couponId: STRIPE_STUDENT_DISCOUNT_COUPON_ID },
        'Failed to retrieve student discount coupon',
      );
      throw new Error('Failed to retrieve student discount coupon');
    }
  },

  /**
   * Create a time-limited promotional coupon (expires in 48 hours)
   * Used for OUT_OF_CHATS_NO_CTA emails to incentivize upgrades
   */
  create48HourCoupon: async (params: {
    percentOff: number;
    userId: number;
    emailType: string;
  }): Promise<CouponInfo> => {
    try {
      const stripe = getStripe();
      const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000); // 48 hours from now

      // Create the coupon
      const coupon = await stripe.coupons.create({
        percent_off: params.percentOff,
        duration: 'once', // Apply once to the subscription
        redeem_by: Math.floor(expiresAt.getTime() / 1000), // Unix timestamp
        metadata: {
          userId: params.userId.toString(),
          emailType: params.emailType,
          createdFor: 'out_of_chats_incentive',
        },
      });

      // Create a promotion code for easier redemption
      const promotionCode = await stripe.promotionCodes.create({
        coupon: coupon.id,
        code: `HAPPY-${params.percentOff}-${params.userId}-${Date.now().toString().slice(-4)}`.toUpperCase(), // Unique code
        max_redemptions: 1,
        metadata: {
          userId: params.userId.toString(),
          emailType: params.emailType,
        },
      });

      logger.info(
        {
          couponId: coupon.id,
          promotionCode: promotionCode.code,
          userId: params.userId,
          expiresAt,
        },
        'Created 48-hour limited coupon',
      );

      return {
        id: coupon.id,
        code: promotionCode.code,
        percentOff: coupon.percent_off ?? undefined,
        expiresAt,
      };
    } catch (error) {
      logger.error({ error, userId: params.userId }, 'Failed to create 48-hour coupon');
      throw new Error('Failed to create promotional coupon');
    }
  },
};
