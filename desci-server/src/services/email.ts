import { CommunitySubmission, DesciCommunity, Node, User } from '@prisma/client';
import sgMail from '@sendgrid/mail';

import { logger as parentLogger } from '../logger.js';
import { DoiMintedEmailHtml, RejectedSubmissionEmailHtml } from '../templates/emails/utils/emailRenderer.js';

export enum EmailTypes {
  DoiMinted,
  DOI_REGISTRATION_REQUESTED,
  RejectedSubmission,
}

type DoiRegisteredPayload = {
  type: EmailTypes.DoiMinted;
  payload: { to: string; name: string; title: string; dpid: string; doi: string };
};

type DoiRequestedPayload = {
  type: EmailTypes.DOI_REGISTRATION_REQUESTED;
  payload: { to: string; subject: string; name: string };
};

type RejectSubmissionPayload = {
  type: EmailTypes.RejectedSubmission;
  payload: {
    // to: string;
    // subject: string;
    // name: string;
    dpid: string;
    reason?: string;
    recipient: {
      email: string;
      name: string;
    };
    communityName: string;
    communitySlug: string;
    nodeVersion: number;
    nodeDpid: string;
    // submission: CommunitySubmission & {
    //   community: Partial<DesciCommunity>;
    //   node: Partial<Node>;
    // };
  };
};

export type EmailProps = DoiRegisteredPayload | DoiRequestedPayload | RejectSubmissionPayload;

const logger = parentLogger.child({ module: 'EmailService' });

export function assertNever(value: never) {
  console.error('Unknown value', value);
  throw Error('Not Possible');
}

async function sendDoiRegisteredEmail({ to, name, title, dpid, doi }: DoiRegisteredPayload['payload']) {
  const message = {
    to,
    from: 'no-reply@desci.com',
    subject: 'DOI Registration successful 🎉',
    text: `Hello ${name}, You DOI registration for the research object ${title} has been completed. Here is your DOI: ${process.env.CROSSREF_DOI_URL}/${doi}`,
    html: DoiMintedEmailHtml({
      dpid,
      doi,
      nodeTitle: title,
      userName: name.split(' ')?.[0] ?? '',
      dpidPath: `${process.env.DAPP_URL}/dpid/${dpid}`,
      doiLink: `${process.env.CROSSREF_DOI_URL}/${doi}`,
    }),
  };

  try {
    if (process.env.NODE_ENV === 'production') {
      const response = await sgMail.send(message);
      logger.trace(response, '[EMAIL]:: Response');
    } else {
      logger.info({ nodeEnv: process.env.NODE_ENV }, message.subject);
    }
  } catch (err) {
    logger.error({ err }, '[ERROR]:: DOI MINTED EMAIL');
  }
}

async function sendDoiRequested(payload: DoiRequestedPayload['payload']) {
  //
}

async function sendRejectSubmissionEmail({
  communityName,
  communitySlug,
  nodeVersion,
  nodeDpid,
  dpid,
  reason,
  recipient,
}: RejectSubmissionPayload['payload']) {
  const message = {
    to: recipient.email,
    from: 'no-reply@desci.com',
    subject: `[nodes.desci.com] Your submission to ${communityName} for DPID://${nodeDpid}/v${nodeVersion} was rejected `,
    text: `Hi ${recipient.name}, your submission to ${communityName} was rejected.`,
    html: RejectedSubmissionEmailHtml({
      reason,
      dpid: dpid.toString(),
      communityName,
      userName: recipient.name,
      dpidPath: `${process.env.DAPP_URL}/dpid/${dpid}/v${nodeVersion}/badges`,
      communityPage: `${process.env.DAPP_URL}/community/${communitySlug}?tab=mysubmissions`,
    }),
  };

  try {
    if (process.env.NODE_ENV === 'production') {
      const response = await sgMail.send(message);
      logger.trace(response, '[EMAIL]:: Response');
    } else {
      logger.info({ nodeEnv: process.env.NODE_ENV }, message.subject);
    }
  } catch (err) {
    logger.error({ err }, '[ERROR]:: RejectedSubmission EMAIL');
  }
}

export const sendEmail = async (props: EmailProps) => {
  switch (props.type) {
    case EmailTypes.DoiMinted:
      return sendDoiRegisteredEmail(props.payload);
    case EmailTypes.DOI_REGISTRATION_REQUESTED:
      return sendDoiRequested(props.payload);
    case EmailTypes.RejectedSubmission:
      return sendRejectSubmissionEmail(props.payload);
    default:
      assertNever(props);
  }
};
