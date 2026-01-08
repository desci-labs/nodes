export enum SciweaveEmailTypes {
  SCIWEAVE_WELCOME_EMAIL = 'SCIWEAVE_WELCOME_EMAIL',
  SCIWEAVE_UPGRADE_EMAIL = 'SCIWEAVE_UPGRADE_EMAIL',
  SCIWEAVE_CANCELLATION_EMAIL = 'SCIWEAVE_CANCELLATION_EMAIL',
  SCIWEAVE_SUBSCRIPTION_ENDED = 'SCIWEAVE_SUBSCRIPTION_ENDED',
  SCIWEAVE_ANNUAL_UPSELL = 'SCIWEAVE_ANNUAL_UPSELL',
  SCIWEAVE_CHECKOUT_1_HOUR = 'SCIWEAVE_CHECKOUT_1_HOUR',
  SCIWEAVE_CHECKOUT_1_DAY_REMAINING = 'SCIWEAVE_CHECKOUT_1_DAY_REMAINING',
  SCIWEAVE_14_DAY_INACTIVITY = 'SCIWEAVE_14_DAY_INACTIVITY',
  SCIWEAVE_OUT_OF_CHATS_INITIAL = 'SCIWEAVE_OUT_OF_CHATS_INITIAL',
  SCIWEAVE_OUT_OF_CHATS_CTA_CLICKED = 'SCIWEAVE_OUT_OF_CHATS_CTA_CLICKED',
  SCIWEAVE_OUT_OF_CHATS_NO_CTA = 'SCIWEAVE_OUT_OF_CHATS_NO_CTA',
  SCIWEAVE_PRO_CHAT_REFRESH = 'SCIWEAVE_PRO_CHAT_REFRESH',
  SCIWEAVE_STUDENT_DISCOUNT = 'SCIWEAVE_STUDENT_DISCOUNT',
  SCIWEAVE_STUDENT_DISCOUNT_LIMIT_REACHED = 'SCIWEAVE_STUDENT_DISCOUNT_LIMIT_REACHED',
}

export type WelcomeEmailPayload = {
  type: SciweaveEmailTypes.SCIWEAVE_WELCOME_EMAIL;
  payload: {
    email: string;
    firstName?: string;
    lastName?: string;
  };
};

export type UpgradeEmailPayload = {
  type: SciweaveEmailTypes.SCIWEAVE_UPGRADE_EMAIL;
  payload: {
    email: string;
    firstName: string;
    lastName?: string;
  };
};

export type CancellationEmailPayload = {
  type: SciweaveEmailTypes.SCIWEAVE_CANCELLATION_EMAIL;
  payload: {
    email: string;
    firstName: string;
    lastName?: string;
  };
};

export type SubscriptionEndedEmailPayload = {
  type: SciweaveEmailTypes.SCIWEAVE_SUBSCRIPTION_ENDED;
  payload: {
    email: string;
    firstName: string;
    lastName?: string;
  };
};

export type AnnualUpsellEmailPayload = {
  type: SciweaveEmailTypes.SCIWEAVE_ANNUAL_UPSELL;
  payload: {
    email: string;
    firstName: string;
    lastName?: string;
  };
};

export type Checkout1HourEmailPayload = {
  type: SciweaveEmailTypes.SCIWEAVE_CHECKOUT_1_HOUR;
  payload: {
    email: string;
    firstName: string;
    lastName?: string;
    couponCode: string;
    percentOff: number;
    expiresAt: Date;
  };
};

export type Checkout1DayRemainingEmailPayload = {
  type: SciweaveEmailTypes.SCIWEAVE_CHECKOUT_1_DAY_REMAINING;
  payload: {
    email: string;
    firstName: string;
    lastName?: string;
    couponCode: string;
    percentOff: number;
    expiresAt: Date;
  };
};

export type InactivityEmailPayload = {
  type: SciweaveEmailTypes.SCIWEAVE_14_DAY_INACTIVITY;
  payload: {
    email: string;
    firstName: string;
    lastName?: string;
  };
};

export type OutOfChatsInitialEmailPayload = {
  type: SciweaveEmailTypes.SCIWEAVE_OUT_OF_CHATS_INITIAL;
  payload: {
    email: string;
    firstName: string;
    lastName?: string;
  };
};

export type OutOfChatsCtaClickedEmailPayload = {
  type: SciweaveEmailTypes.SCIWEAVE_OUT_OF_CHATS_CTA_CLICKED;
  payload: {
    email: string;
    firstName: string;
    lastName?: string;
    couponCode: string; // 48-hour limited coupon
    percentOff: number;
    expiresAt: Date;
  };
};

export type OutOfChatsNoCtaEmailPayload = {
  type: SciweaveEmailTypes.SCIWEAVE_OUT_OF_CHATS_NO_CTA;
  payload: {
    email: string;
    firstName: string;
    lastName?: string;
    couponCode: string; // 48-hour limited coupon
    percentOff: number;
    expiresAt: Date;
  };
};

export type ProChatRefreshEmailPayload = {
  type: SciweaveEmailTypes.SCIWEAVE_PRO_CHAT_REFRESH;
  payload: {
    email: string;
    firstName: string;
    lastName?: string;
  };
};

export type StudentDiscountEmailPayload = {
  type: SciweaveEmailTypes.SCIWEAVE_STUDENT_DISCOUNT;
  payload: {
    email: string;
    firstName: string;
    lastName?: string;
    couponCode: string; // Student discount coupon
    percentOff?: number;
  };
};

export type StudentDiscountLimitReachedEmailPayload = {
  type: SciweaveEmailTypes.SCIWEAVE_STUDENT_DISCOUNT_LIMIT_REACHED;
  payload: {
    email: string;
    firstName: string;
    lastName?: string;
    couponCode: string; // Student discount coupon
    percentOff?: number;
  };
};

export type SciweaveEmailProps =
  | WelcomeEmailPayload
  | UpgradeEmailPayload
  | CancellationEmailPayload
  | SubscriptionEndedEmailPayload
  | AnnualUpsellEmailPayload
  | Checkout1HourEmailPayload
  | Checkout1DayRemainingEmailPayload
  | InactivityEmailPayload
  | OutOfChatsInitialEmailPayload
  | OutOfChatsCtaClickedEmailPayload
  | OutOfChatsNoCtaEmailPayload
  | ProChatRefreshEmailPayload
  | StudentDiscountEmailPayload
  | StudentDiscountLimitReachedEmailPayload;
