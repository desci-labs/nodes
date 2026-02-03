import sgMail from '@sendgrid/mail';

import {
  SENDGRID_API_KEY,
  SCIWEAVE_SENDGRID_TEMPLATE_ID_MAP,
  SHOULD_SEND_EMAIL,
  SENDGRID_ASM_GROUP_IDS,
} from '../../config.js';
import { logger as parentLogger } from '../../logger.js';
import { getRelativeTime } from '../../utils/clock.js';

sgMail.setApiKey(SENDGRID_API_KEY);

import {
  SciweaveEmailTypes,
  SciweaveEmailProps,
  WelcomeEmailPayload,
  UpgradeEmailPayload,
  CancellationEmailPayload,
  SubscriptionEndedEmailPayload,
  AnnualUpsellEmailPayload,
  Checkout1HourEmailPayload,
  Checkout1DayRemainingEmailPayload,
  InactivityEmailPayload,
  OutOfChatsInitialEmailPayload,
  OutOfChatsCtaClickedEmailPayload,
  OutOfChatsNoCtaEmailPayload,
  ProChatRefreshEmailPayload,
  StudentDiscountEmailPayload,
  StudentDiscountLimitReachedEmailPayload,
  NewUser3DayEmailPayload,
} from './sciweaveEmailTypes.js';

/**
 * Used to add a prefix to the email subject to indicate the deployment environment
 * e.g. [dev.sciweave.com], [sciweave.com]
 */
const deploymentEnvironmentString =
  process.env.SERVER_URL === 'https://nodes-api.desci.com'
    ? '' // Prod wouldn't need a prefix
    : process.env.SERVER_URL === 'https://nodes-api-dev.desci.com'
      ? 'dev.'
      : 'local.';

const sciweaveTemplateIdMap = SCIWEAVE_SENDGRID_TEMPLATE_ID_MAP
  ? (JSON.parse(SCIWEAVE_SENDGRID_TEMPLATE_ID_MAP || '{}') as Record<SciweaveEmailTypes, string>)
  : {};

const logger = parentLogger.child({ module: 'SciweaveEmailService' });

/**
 * Marketing email types that users can unsubscribe from
 * All other Sciweave emails are considered transactional
 */
const SCIWEAVE_MARKETING_EMAIL_TYPES = new Set<SciweaveEmailTypes>([
  SciweaveEmailTypes.SCIWEAVE_ANNUAL_UPSELL,
  SciweaveEmailTypes.SCIWEAVE_CHECKOUT_1_HOUR,
  SciweaveEmailTypes.SCIWEAVE_CHECKOUT_1_DAY_REMAINING,
  SciweaveEmailTypes.SCIWEAVE_14_DAY_INACTIVITY,
  SciweaveEmailTypes.SCIWEAVE_OUT_OF_CHATS_INITIAL,
  SciweaveEmailTypes.SCIWEAVE_OUT_OF_CHATS_CTA_CLICKED,
  SciweaveEmailTypes.SCIWEAVE_OUT_OF_CHATS_NO_CTA,
  SciweaveEmailTypes.SCIWEAVE_STUDENT_DISCOUNT,
  SciweaveEmailTypes.SCIWEAVE_STUDENT_DISCOUNT_LIMIT_REACHED,
  SciweaveEmailTypes.SCIWEAVE_NEW_USER_3_DAY,
]);

/**
 * Get the appropriate SendGrid ASM group ID for a Sciweave email type
 */
function getAsmGroupId(emailType: SciweaveEmailTypes): number {
  return SCIWEAVE_MARKETING_EMAIL_TYPES.has(emailType)
    ? SENDGRID_ASM_GROUP_IDS.SCIWEAVE_MARKETING
    : SENDGRID_ASM_GROUP_IDS.SCIWEAVE_TRANSACTIONAL;
}

/**
 * Sends an email using SendGrid for Sciweave
 * @param message - The SendGrid message to send
 * @param emailType - The type of Sciweave email being sent (used to determine ASM group)
 * @param devLog - Optional object with additional information to log in dev mode
 * @returns Object containing SendGrid message ID prefix and internal tracking ID
 */
async function sendSciweaveEmail(
  message: sgMail.MailDataRequired,
  emailType: SciweaveEmailTypes,
  devLog?: Record<string, string>,
): Promise<{ sgMessageIdPrefix?: string; internalTrackingId: string; success: boolean }> {
  // Generate tracking ID outside try block so it's always available
  const internalTrackingId = `sciweave_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
  let sgMessageIdPrefix: string | undefined;
  let success = false;

  try {
    if (SHOULD_SEND_EMAIL) {
      const subjectPrefix =
        process.env.SERVER_URL === 'https://nodes-api.desci.com'
          ? '[sciweave.com]'
          : process.env.SERVER_URL === 'https://nodes-api-dev.desci.com'
            ? '[dev.sciweave.com]'
            : '[local-sciweave]';

      message.subject = `${subjectPrefix} ${message.subject}`;

      // Add internal tracking ID and app type for webhook processing
      message.customArgs = {
        ...message.customArgs,
        internal_tracking_id: internalTrackingId,
        app_type: 'SCIWEAVE',
      };

      // Add ASM group for unsubscribe management
      // groupsToDisplay limits which groups users can see/unsubscribe from
      // For Sciweave emails, only show Sciweave marketing group
      message.asm = {
        groupId: getAsmGroupId(emailType),
        groupsToDisplay: [SENDGRID_ASM_GROUP_IDS.SCIWEAVE_MARKETING],
      };

      const response = await sgMail.send(message);
      logger.trace(response, '[SCIWEAVE_EMAIL]:: Response');

      // Extract message ID from response headers (partial ID)
      if (response && response[0] && response[0].headers) {
        sgMessageIdPrefix = response[0].headers['x-message-id'] as string;
      }

      success = true;
    } else {
      logger.info({ nodeEnv: process.env.NODE_ENV }, '[SCIWEAVE_EMAIL]::', message.subject);
    }

    if (process.env.NODE_ENV === 'dev') {
      // Print this anyway whilst developing, even if emails are being sent
      const email = message.to;
      const Reset = '\x1b[0m';
      const BgGreen = '\x1b[42m';
      const BgYellow = '\x1b[43m';
      const BIG_SIGNAL = `\n\n${BgYellow}$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$${Reset}\n\n`;
      logger.info(
        { devLog, sgMessageIdPrefix, internalTrackingId },
        `${BIG_SIGNAL}Sciweave Email sent to ${email}\n\n${BgGreen}${message.subject}${Reset}${BIG_SIGNAL}`,
      );
    }
  } catch (err) {
    logger.error({ err, internalTrackingId }, '[ERROR]:: SCIWEAVE_EMAIL');
  }

  return { sgMessageIdPrefix, internalTrackingId, success };
}

export function assertNever(value: never) {
  console.error('Unknown Sciweave email type', value);
  throw Error('Not Possible');
}

async function sendWelcomeEmail({ email, firstName, lastName }: WelcomeEmailPayload['payload']) {
  const templateId = sciweaveTemplateIdMap[SciweaveEmailTypes.SCIWEAVE_WELCOME_EMAIL];

  if (!templateId) {
    logger.error(`No template ID found for ${SciweaveEmailTypes.SCIWEAVE_WELCOME_EMAIL}`);
    return undefined;
  }

  const message = {
    to: email,
    from: 'no-reply@desci.com',
    templateId,
    dynamicTemplateData: {
      envUrlPrefix: deploymentEnvironmentString,
      user: {
        firstName: firstName || '',
        lastName: lastName || '',
        email,
      },
    },
  };

  return await sendSciweaveEmail(message, SciweaveEmailTypes.SCIWEAVE_WELCOME_EMAIL, { templateId });
}

async function sendUpgradeEmail({ email, firstName, lastName }: UpgradeEmailPayload['payload']) {
  const templateId = sciweaveTemplateIdMap[SciweaveEmailTypes.SCIWEAVE_UPGRADE_EMAIL];

  if (!templateId) {
    logger.error(`No template ID found for ${SciweaveEmailTypes.SCIWEAVE_UPGRADE_EMAIL}`);
    return undefined;
  }

  const message = {
    to: email,
    from: 'no-reply@desci.com',
    templateId,
    dynamicTemplateData: {
      envUrlPrefix: deploymentEnvironmentString,
      user: {
        firstName: firstName || '',
        lastName: lastName || '',
        email,
      },
    },
  };

  return await sendSciweaveEmail(message, SciweaveEmailTypes.SCIWEAVE_UPGRADE_EMAIL, { templateId });
}

async function sendCancellationEmail({ email, firstName, lastName }: CancellationEmailPayload['payload']) {
  const templateId = sciweaveTemplateIdMap[SciweaveEmailTypes.SCIWEAVE_CANCELLATION_EMAIL];

  if (!templateId) {
    logger.error(`No template ID found for ${SciweaveEmailTypes.SCIWEAVE_CANCELLATION_EMAIL}`);
    return undefined;
  }

  const message = {
    to: email,
    from: 'no-reply@desci.com',
    templateId,
    dynamicTemplateData: {
      envUrlPrefix: deploymentEnvironmentString,
      user: {
        firstName: firstName || '',
        lastName: lastName || '',
        email,
      },
    },
  };

  return await sendSciweaveEmail(message, SciweaveEmailTypes.SCIWEAVE_CANCELLATION_EMAIL, { templateId });
}

async function sendSubscriptionEndedEmail({ email, firstName, lastName }: SubscriptionEndedEmailPayload['payload']) {
  const templateId = sciweaveTemplateIdMap[SciweaveEmailTypes.SCIWEAVE_SUBSCRIPTION_ENDED];

  if (!templateId) {
    logger.error(`No template ID found for ${SciweaveEmailTypes.SCIWEAVE_SUBSCRIPTION_ENDED}`);
    return undefined;
  }

  const message = {
    to: email,
    from: 'no-reply@desci.com',
    templateId,
    dynamicTemplateData: {
      envUrlPrefix: deploymentEnvironmentString,
      user: {
        firstName: firstName || '',
        lastName: lastName || '',
        email,
      },
    },
  };

  return await sendSciweaveEmail(message, SciweaveEmailTypes.SCIWEAVE_SUBSCRIPTION_ENDED, { templateId });
}

async function sendAnnualUpsellEmail({ email, firstName, lastName }: AnnualUpsellEmailPayload['payload']) {
  const templateId = sciweaveTemplateIdMap[SciweaveEmailTypes.SCIWEAVE_ANNUAL_UPSELL];

  if (!templateId) {
    logger.error(`No template ID found for ${SciweaveEmailTypes.SCIWEAVE_ANNUAL_UPSELL}`);
    return undefined;
  }

  const message = {
    to: email,
    from: 'no-reply@desci.com',
    templateId,
    dynamicTemplateData: {
      envUrlPrefix: deploymentEnvironmentString,
      user: {
        firstName: firstName || '',
        lastName: lastName || '',
        email,
      },
    },
  };

  return await sendSciweaveEmail(message, SciweaveEmailTypes.SCIWEAVE_ANNUAL_UPSELL, { templateId });
}

async function sendCheckout1HourEmail({
  email,
  firstName,
  lastName,
  couponCode,
  percentOff,
  expiresAt,
}: Checkout1HourEmailPayload['payload']) {
  const templateId = sciweaveTemplateIdMap[SciweaveEmailTypes.SCIWEAVE_CHECKOUT_1_HOUR];

  if (!templateId) {
    logger.error(`No template ID found for ${SciweaveEmailTypes.SCIWEAVE_CHECKOUT_1_HOUR}`);
    return undefined;
  }

  const message = {
    to: email,
    from: 'no-reply@desci.com',
    templateId,
    dynamicTemplateData: {
      envUrlPrefix: deploymentEnvironmentString,
      user: {
        firstName: firstName || '',
        lastName: lastName || '',
        email,
      },
      couponCode,
      percentOff,
      expiresAt: expiresAt.toISOString(),
      expiresAtFormatted: expiresAt.toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      }),
      expiresAtRelative: getRelativeTime(expiresAt),
    },
  };

  return await sendSciweaveEmail(message, SciweaveEmailTypes.SCIWEAVE_CHECKOUT_1_HOUR, { templateId });
}

async function sendCheckout1DayRemainingEmail({
  email,
  firstName,
  lastName,
  couponCode,
  percentOff,
  expiresAt,
}: Checkout1DayRemainingEmailPayload['payload']) {
  const templateId = sciweaveTemplateIdMap[SciweaveEmailTypes.SCIWEAVE_CHECKOUT_1_DAY_REMAINING];

  if (!templateId) {
    logger.error(`No template ID found for ${SciweaveEmailTypes.SCIWEAVE_CHECKOUT_1_DAY_REMAINING}`);
    return undefined;
  }

  const message = {
    to: email,
    from: 'no-reply@desci.com',
    templateId,
    dynamicTemplateData: {
      envUrlPrefix: deploymentEnvironmentString,
      user: {
        firstName: firstName || '',
        lastName: lastName || '',
        email,
      },
      couponCode,
      percentOff,
      expiresAt: expiresAt.toISOString(),
      expiresAtFormatted: expiresAt.toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      }),
      expiresAtRelative: getRelativeTime(expiresAt),
    },
  };

  return await sendSciweaveEmail(message, SciweaveEmailTypes.SCIWEAVE_CHECKOUT_1_DAY_REMAINING, { templateId });
}

async function send14DayInactivityEmail({ email, firstName, lastName }: InactivityEmailPayload['payload']) {
  const templateId = sciweaveTemplateIdMap[SciweaveEmailTypes.SCIWEAVE_14_DAY_INACTIVITY];

  if (!templateId) {
    logger.error(`No template ID found for ${SciweaveEmailTypes.SCIWEAVE_14_DAY_INACTIVITY}`);
    return undefined;
  }

  const message = {
    to: email,
    from: { email: 'no-reply@desci.com', name: 'SciWeave' },
    templateId,
    dynamicTemplateData: {
      envUrlPrefix: deploymentEnvironmentString,
      user: {
        firstName: firstName || '',
        lastName: lastName || '',
        email,
      },
    },
  };

  return await sendSciweaveEmail(message, SciweaveEmailTypes.SCIWEAVE_14_DAY_INACTIVITY, { templateId });
}

async function sendOutOfChatsInitialEmail({ email, firstName, lastName }: OutOfChatsInitialEmailPayload['payload']) {
  const templateId = sciweaveTemplateIdMap[SciweaveEmailTypes.SCIWEAVE_OUT_OF_CHATS_INITIAL];
  if (!templateId) {
    logger.error(`No template ID found for ${SciweaveEmailTypes.SCIWEAVE_OUT_OF_CHATS_INITIAL}`);
    return undefined;
  }
  const message = {
    to: email,
    from: 'no-reply@desci.com',
    templateId,
    dynamicTemplateData: {
      envUrlPrefix: deploymentEnvironmentString,
      user: { firstName: firstName || '', lastName: lastName || '', email },
    },
  };
  return await sendSciweaveEmail(message, SciweaveEmailTypes.SCIWEAVE_OUT_OF_CHATS_INITIAL, { templateId });
}

async function sendOutOfChatsCtaClickedEmail({
  email,
  firstName,
  lastName,
  couponCode,
  percentOff,
  expiresAt,
}: OutOfChatsCtaClickedEmailPayload['payload']) {
  const templateId = sciweaveTemplateIdMap[SciweaveEmailTypes.SCIWEAVE_OUT_OF_CHATS_CTA_CLICKED];
  if (!templateId) {
    logger.error(`No template ID found for ${SciweaveEmailTypes.SCIWEAVE_OUT_OF_CHATS_CTA_CLICKED}`);
    return undefined;
  }
  const message = {
    to: email,
    from: 'no-reply@desci.com',
    templateId,
    dynamicTemplateData: {
      envUrlPrefix: deploymentEnvironmentString,
      user: { firstName: firstName || '', lastName: lastName || '', email },
      couponCode,
      percentOff,
      expiresAt: expiresAt.toISOString(),
    },
  };
  return await sendSciweaveEmail(message, SciweaveEmailTypes.SCIWEAVE_OUT_OF_CHATS_CTA_CLICKED, { templateId });
}

async function sendOutOfChatsNoCtaEmail({
  email,
  firstName,
  lastName,
  couponCode,
  percentOff,
  expiresAt,
}: OutOfChatsNoCtaEmailPayload['payload']) {
  const templateId = sciweaveTemplateIdMap[SciweaveEmailTypes.SCIWEAVE_OUT_OF_CHATS_NO_CTA];
  if (!templateId) {
    logger.error(`No template ID found for ${SciweaveEmailTypes.SCIWEAVE_OUT_OF_CHATS_NO_CTA}`);
    return undefined;
  }
  const message = {
    to: email,
    from: 'no-reply@desci.com',
    templateId,
    dynamicTemplateData: {
      envUrlPrefix: deploymentEnvironmentString,
      user: { firstName: firstName || '', lastName: lastName || '', email },
      couponCode,
      percentOff,
      expiresAt: expiresAt.toISOString(),
      expiresAtFormatted: expiresAt.toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      }),
    },
  };
  return await sendSciweaveEmail(message, SciweaveEmailTypes.SCIWEAVE_OUT_OF_CHATS_NO_CTA, { templateId });
}

async function sendProChatRefreshEmail({ email, firstName, lastName }: ProChatRefreshEmailPayload['payload']) {
  const templateId = sciweaveTemplateIdMap[SciweaveEmailTypes.SCIWEAVE_PRO_CHAT_REFRESH];
  if (!templateId) {
    logger.error(`No template ID found for ${SciweaveEmailTypes.SCIWEAVE_PRO_CHAT_REFRESH}`);
    return undefined;
  }
  const message = {
    to: email,
    from: 'no-reply@desci.com',
    templateId,
    dynamicTemplateData: {
      envUrlPrefix: deploymentEnvironmentString,
      user: { firstName: firstName || '', lastName: lastName || '', email },
    },
  };
  return await sendSciweaveEmail(message, SciweaveEmailTypes.SCIWEAVE_PRO_CHAT_REFRESH, { templateId });
}

async function sendStudentDiscountEmail({
  email,
  firstName,
  lastName,
  couponCode,
  percentOff,
}: StudentDiscountEmailPayload['payload']) {
  const templateId = sciweaveTemplateIdMap[SciweaveEmailTypes.SCIWEAVE_STUDENT_DISCOUNT];
  if (!templateId) {
    logger.error(`No template ID found for ${SciweaveEmailTypes.SCIWEAVE_STUDENT_DISCOUNT}`);
    return undefined;
  }
  const message = {
    to: email,
    from: 'no-reply@desci.com',
    templateId,
    dynamicTemplateData: {
      envUrlPrefix: deploymentEnvironmentString,
      user: { firstName: firstName || '', lastName: lastName || '', email },
      couponCode,
      percentOff: percentOff || 0,
    },
  };
  return await sendSciweaveEmail(message, SciweaveEmailTypes.SCIWEAVE_STUDENT_DISCOUNT, { templateId });
}

async function sendStudentDiscountLimitReachedEmail({
  email,
  firstName,
  lastName,
  couponCode,
  percentOff,
}: StudentDiscountLimitReachedEmailPayload['payload']) {
  const templateId = sciweaveTemplateIdMap[SciweaveEmailTypes.SCIWEAVE_STUDENT_DISCOUNT_LIMIT_REACHED];
  if (!templateId) {
    logger.error(`No template ID found for ${SciweaveEmailTypes.SCIWEAVE_STUDENT_DISCOUNT_LIMIT_REACHED}`);
    return undefined;
  }
  const message = {
    to: email,
    from: 'no-reply@desci.com',
    templateId,
    dynamicTemplateData: {
      envUrlPrefix: deploymentEnvironmentString,
      user: { firstName: firstName || '', lastName: lastName || '', email },
      couponCode,
      percentOff: percentOff || 0,
    },
  };
  return await sendSciweaveEmail(message, SciweaveEmailTypes.SCIWEAVE_STUDENT_DISCOUNT_LIMIT_REACHED, { templateId });
}

async function sendNewUser3DayEmail({ email, firstName, lastName }: NewUser3DayEmailPayload['payload']) {
  const templateId = sciweaveTemplateIdMap[SciweaveEmailTypes.SCIWEAVE_NEW_USER_3_DAY];
  if (!templateId) {
    logger.error(`No template ID found for ${SciweaveEmailTypes.SCIWEAVE_NEW_USER_3_DAY}`);
    return undefined;
  }
  const message = {
    to: email,
    from: 'no-reply@desci.com',
    templateId,
    dynamicTemplateData: {
      envUrlPrefix: deploymentEnvironmentString,
      user: { firstName: firstName || '', lastName: lastName || '', email },
    },
  };
  return await sendSciweaveEmail(message, SciweaveEmailTypes.SCIWEAVE_NEW_USER_3_DAY, { templateId });
}

export const sendSciweaveEmailService = async (props: SciweaveEmailProps) => {
  switch (props.type) {
    case SciweaveEmailTypes.SCIWEAVE_WELCOME_EMAIL:
      return sendWelcomeEmail(props.payload);
    case SciweaveEmailTypes.SCIWEAVE_UPGRADE_EMAIL:
      return sendUpgradeEmail(props.payload);
    case SciweaveEmailTypes.SCIWEAVE_CANCELLATION_EMAIL:
      return sendCancellationEmail(props.payload);
    case SciweaveEmailTypes.SCIWEAVE_SUBSCRIPTION_ENDED:
      return sendSubscriptionEndedEmail(props.payload);
    case SciweaveEmailTypes.SCIWEAVE_ANNUAL_UPSELL:
      return sendAnnualUpsellEmail(props.payload);
    case SciweaveEmailTypes.SCIWEAVE_CHECKOUT_1_HOUR:
      return sendCheckout1HourEmail(props.payload);
    case SciweaveEmailTypes.SCIWEAVE_CHECKOUT_1_DAY_REMAINING:
      return sendCheckout1DayRemainingEmail(props.payload);
    case SciweaveEmailTypes.SCIWEAVE_14_DAY_INACTIVITY:
      return send14DayInactivityEmail(props.payload);
    case SciweaveEmailTypes.SCIWEAVE_OUT_OF_CHATS_INITIAL:
      return sendOutOfChatsInitialEmail(props.payload);
    case SciweaveEmailTypes.SCIWEAVE_OUT_OF_CHATS_CTA_CLICKED:
      return sendOutOfChatsCtaClickedEmail(props.payload);
    case SciweaveEmailTypes.SCIWEAVE_OUT_OF_CHATS_NO_CTA:
      return sendOutOfChatsNoCtaEmail(props.payload);
    case SciweaveEmailTypes.SCIWEAVE_PRO_CHAT_REFRESH:
      return sendProChatRefreshEmail(props.payload);
    case SciweaveEmailTypes.SCIWEAVE_STUDENT_DISCOUNT:
      return sendStudentDiscountEmail(props.payload);
    case SciweaveEmailTypes.SCIWEAVE_STUDENT_DISCOUNT_LIMIT_REACHED:
      return sendStudentDiscountLimitReachedEmail(props.payload);
    case SciweaveEmailTypes.SCIWEAVE_NEW_USER_3_DAY:
      return sendNewUser3DayEmail(props.payload);
    default:
      return assertNever(props);
  }
};
