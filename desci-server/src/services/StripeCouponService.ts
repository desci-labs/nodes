import {
  SCIWEAVE_STUDENT_DISCOUNT_PERCENT,
  STRIPE_STUDENT_DISCOUNT_COUPON_ID,
  STRIPE_USER_DISCOUNT_COUPON_ID,
} from '../config.js';
import { logger as parentLogger } from '../logger.js';
import { getStripe } from '../utils/stripe.js';

const logger = parentLogger.child({ module: 'StripeCouponService' });

/**
 * Stripe Coupon Service
 *
 * Manages promotion code creation from base coupons for promotional offers.
 */

/**
 * Generate a random alphanumeric code
 */
function generateRandomCode(length: number = 5): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Exclude similar looking chars (0/O, 1/I)
  let code = '';
  for (let i = 0; i < length; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

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
   * Create a student discount promotion code
   * Scoped to the user's email address
   */
  getStudentDiscountCoupon: async (params: { userId: number; email: string }): Promise<CouponInfo> => {
    if (!STRIPE_STUDENT_DISCOUNT_COUPON_ID) {
      throw new Error(
        'STRIPE_STUDENT_DISCOUNT_COUPON_ID is not configured. Please create a student discount coupon in Stripe and set the environment variable.',
      );
    }

    try {
      const stripe = getStripe();
      const coupon = await stripe.coupons.retrieve(STRIPE_STUDENT_DISCOUNT_COUPON_ID);

      // Generate unique code with 8-character random suffix for security
      const randomCode = generateRandomCode(8);
      const promoCode = `STUDENT-${params.userId}-${randomCode}`;

      // Create a promotion code with unique random suffix
      const promotionCode = await stripe.promotionCodes.create({
        coupon: coupon.id,
        code: promoCode,
        restrictions: {
          first_time_transaction: false, // Allow existing customers
        },
        metadata: {
          userId: params.userId.toString(),
          email: params.email,
          type: 'student_discount',
        },
      });

      logger.info(
        { couponId: coupon.id, promotionCode: promotionCode.code, userId: params.userId, email: params.email },
        'Created student discount promotion code',
      );

      return {
        id: coupon.id,
        code: promotionCode.code,
        percentOff: coupon.percent_off ?? SCIWEAVE_STUDENT_DISCOUNT_PERCENT,
        amountOff: coupon.amount_off ?? undefined,
        currency: coupon.currency ?? undefined,
      };
    } catch (error) {
      logger.error(
        { error, couponId: STRIPE_STUDENT_DISCOUNT_COUPON_ID, userId: params.userId },
        'Failed to create student discount promotion code',
      );
      throw new Error('Failed to create student discount promotion code');
    }
  },

  /**
   * Create a time-limited promotional code (expires in 48 hours)
   * Scoped to the user's email address
   * Used for OUT_OF_CHATS_NO_CTA emails to incentivize upgrades
   */
  create48HourCoupon: async (params: {
    percentOff: number;
    userId: number;
    email: string;
    emailType: string;
  }): Promise<CouponInfo> => {
    if (!STRIPE_USER_DISCOUNT_COUPON_ID) {
      throw new Error(
        'STRIPE_USER_DISCOUNT_COUPON_ID is not configured. Please create a user discount coupon in Stripe and set the environment variable.',
      );
    }

    try {
      const stripe = getStripe();
      const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000); // 48 hours from now

      // Retrieve the base coupon
      const coupon = await stripe.coupons.retrieve(STRIPE_USER_DISCOUNT_COUPON_ID);

      // Verify coupon percent matches configured discount
      if (coupon.percent_off != null && coupon.percent_off !== params.percentOff) {
        logger.error(
          { configuredPercent: params.percentOff, stripeCouponPercent: coupon.percent_off, couponId: coupon.id },
          'Coupon percent mismatch',
        );
        throw new Error('Configured discount percent does not match Stripe coupon percent');
      }

      // Generate unique code with random suffix for security
      const randomCode = generateRandomCode();
      const promoCode = `HAPPY-${params.percentOff}-${params.userId}-${randomCode}`;

      // Create a promotion code with 48-hour expiration and unique random suffix
      const promotionCode = await stripe.promotionCodes.create({
        coupon: coupon.id,
        code: promoCode,
        expires_at: Math.floor(expiresAt.getTime() / 1000),
        max_redemptions: 1,
        restrictions: {
          first_time_transaction: false, // Allow existing customers
        },
        metadata: {
          userId: params.userId.toString(),
          email: params.email,
          emailType: params.emailType,
          createdFor: 'out_of_chats_incentive',
        },
      });

      logger.info(
        {
          couponId: coupon.id,
          promotionCode: promotionCode.code,
          userId: params.userId,
          email: params.email,
          expiresAt,
        },
        'Created 48-hour limited promotion code',
      );

      return {
        id: coupon.id,
        code: promotionCode.code,
        percentOff: coupon.percent_off ?? params.percentOff,
        expiresAt,
      };
    } catch (error) {
      logger.error({ error, userId: params.userId }, 'Failed to create 48-hour promotion code');
      throw new Error('Failed to create promotional code');
    }
  },
};
