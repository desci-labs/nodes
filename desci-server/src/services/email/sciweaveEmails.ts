import sgMail from '@sendgrid/mail';

import { SENDGRID_API_KEY, SCIWEAVE_SENDGRID_TEMPLATE_ID_MAP, SHOULD_SEND_EMAIL } from '../../config.js';
import { logger as parentLogger } from '../../logger.js';

sgMail.setApiKey(SENDGRID_API_KEY);

import {
  SciweaveEmailTypes,
  SciweaveEmailProps,
  WelcomeEmailPayload,
  UpgradeEmailPayload,
  CancellationEmailPayload,
  InactivityEmailPayload,
  OutOfChatsInitialEmailPayload,
  OutOfChatsCtaClickedEmailPayload,
  OutOfChatsNoCtaEmailPayload,
  ProChatRefreshEmailPayload,
  StudentDiscountEmailPayload,
  StudentDiscountLimitReachedEmailPayload,
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
 * Sends an email using SendGrid for Sciweave
 * @param devLog - Optional object with additional information to log in dev mode
 * @returns Object containing SendGrid message ID prefix and internal tracking ID
 */
async function sendSciweaveEmail(
  message: sgMail.MailDataRequired,
  devLog?: Record<string, string>,
): Promise<{ sgMessageIdPrefix?: string; internalTrackingId: string } | undefined> {
  try {
    let sgMessageIdPrefix: string | undefined;
    const internalTrackingId = `sciweave_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;

    if (SHOULD_SEND_EMAIL) {
      const subjectPrefix =
        process.env.SERVER_URL === 'https://nodes-api.desci.com'
          ? '[sciweave.com]'
          : process.env.SERVER_URL === 'https://nodes-api-dev.desci.com'
            ? '[dev.sciweave.com]'
            : '[local-sciweave]';

      message.subject = `${subjectPrefix} ${message.subject}`;

      // Add internal tracking ID
      message.customArgs = {
        ...message.customArgs,
        internal_tracking_id: internalTrackingId,
      };

      const response = await sgMail.send(message);
      logger.trace(response, '[SCIWEAVE_EMAIL]:: Response');

      // Extract message ID from response headers (partial ID)
      if (response && response[0] && response[0].headers) {
        sgMessageIdPrefix = response[0].headers['x-message-id'] as string;
      }
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

    return { sgMessageIdPrefix, internalTrackingId };
  } catch (err) {
    logger.error({ err }, '[ERROR]:: SCIWEAVE_EMAIL');
    return undefined;
  }
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

  return await sendSciweaveEmail(message, { templateId });
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

  return await sendSciweaveEmail(message, { templateId });
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

  return await sendSciweaveEmail(message, { templateId });
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

  return await sendSciweaveEmail(message, { templateId });
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
  return await sendSciweaveEmail(message, { templateId });
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
  return await sendSciweaveEmail(message, { templateId });
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
  return await sendSciweaveEmail(message, { templateId });
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
  return await sendSciweaveEmail(message, { templateId });
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
  return await sendSciweaveEmail(message, { templateId });
}

async function sendStudentDiscountLimitReachedEmail({
  email,
  firstName,
  lastName,
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
    },
  };
  return await sendSciweaveEmail(message, { templateId });
}

export const sendSciweaveEmailService = async (props: SciweaveEmailProps) => {
  switch (props.type) {
    case SciweaveEmailTypes.SCIWEAVE_WELCOME_EMAIL:
      return sendWelcomeEmail(props.payload);
    case SciweaveEmailTypes.SCIWEAVE_UPGRADE_EMAIL:
      return sendUpgradeEmail(props.payload);
    case SciweaveEmailTypes.SCIWEAVE_CANCELLATION_EMAIL:
      return sendCancellationEmail(props.payload);
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
    default:
      return assertNever(props);
  }
};
