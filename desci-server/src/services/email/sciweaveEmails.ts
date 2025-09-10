import sgMail from '@sendgrid/mail';

import { SCIWEAVE_SENDGRID_TEMPLATE_ID_MAP, SHOULD_SEND_EMAIL } from '../../config.js';
import { logger as parentLogger } from '../../logger.js';

import {
  SciweaveEmailTypes,
  SciweaveEmailProps,
  WelcomeEmailPayload,
  UpgradeEmailPayload,
  CancellationEmailPayload,
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

const sciweaveTemplateIdMap = JSON.parse(SCIWEAVE_SENDGRID_TEMPLATE_ID_MAP ?? '{}') as Record<
  SciweaveEmailTypes,
  string
>;

const logger = parentLogger.child({ module: 'SciweaveEmailService' });

/**
 * Sends an email using SendGrid for Sciweave
 * @param devLog - Optional object with additional information to log in dev mode
 */
async function sendSciweaveEmail(message: sgMail.MailDataRequired, devLog?: Record<string, string>) {
  try {
    if (SHOULD_SEND_EMAIL) {
      const subjectPrefix =
        process.env.SERVER_URL === 'https://nodes-api.desci.com'
          ? '[sciweave.com]'
          : process.env.SERVER_URL === 'https://nodes-api-dev.desci.com'
            ? '[dev.sciweave.com]'
            : '[local-sciweave]';

      message.subject = `${subjectPrefix} ${message.subject}`;
      const response = await sgMail.send(message);
      logger.trace(response, '[SCIWEAVE_EMAIL]:: Response');
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
        { devLog },
        `${BIG_SIGNAL}Sciweave Email sent to ${email}\n\n${BgGreen}${message.subject}${Reset}${BIG_SIGNAL}`,
      );
    }
  } catch (err) {
    logger.error({ err }, '[ERROR]:: SCIWEAVE_EMAIL');
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
    return;
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

  await sendSciweaveEmail(message, { templateId });
}

async function sendUpgradeEmail({ email, firstName, lastName }: UpgradeEmailPayload['payload']) {
  const templateId = sciweaveTemplateIdMap[SciweaveEmailTypes.SCIWEAVE_UPGRADE_EMAIL];

  if (!templateId) {
    logger.error(`No template ID found for ${SciweaveEmailTypes.SCIWEAVE_UPGRADE_EMAIL}`);
    return;
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

  await sendSciweaveEmail(message, { templateId });
}

async function sendCancellationEmail({ email, firstName, lastName }: CancellationEmailPayload['payload']) {
  const templateId = sciweaveTemplateIdMap[SciweaveEmailTypes.SCIWEAVE_CANCELLATION_EMAIL];

  if (!templateId) {
    logger.error(`No template ID found for ${SciweaveEmailTypes.SCIWEAVE_CANCELLATION_EMAIL}`);
    return;
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

  await sendSciweaveEmail(message, { templateId });
}

export const sendSciweaveEmailService = async (props: SciweaveEmailProps) => {
  switch (props.type) {
    case SciweaveEmailTypes.SCIWEAVE_WELCOME_EMAIL:
      return sendWelcomeEmail(props.payload);
    case SciweaveEmailTypes.SCIWEAVE_UPGRADE_EMAIL:
      return sendUpgradeEmail(props.payload);
    case SciweaveEmailTypes.SCIWEAVE_CANCELLATION_EMAIL:
      return sendCancellationEmail(props.payload);
    default:
      assertNever(props);
  }
};
