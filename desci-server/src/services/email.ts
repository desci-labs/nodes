import { CommunitySubmission, DesciCommunity, Node, User } from '@prisma/client';
import sgMail from '@sendgrid/mail';

import { logger as parentLogger } from '../logger.js';
import { DeskRejectionEmailProps } from '../templates/emails/journals/DeskRejection.js';
import ExternalRefereeInviteEmail, {
  ExternalRefereeInviteEmailProps,
} from '../templates/emails/journals/ExternalRefereeInvite.js';
import { FinalRejectionDecisionEmailProps } from '../templates/emails/journals/FinalRejectionDecision.js';
import InviteEditorEmail, { InviteEditorEmailProps, roleCopy } from '../templates/emails/journals/InviteEditor.js';
import { MajorRevisionRequestEmailProps } from '../templates/emails/journals/MajorRevisionRequest.js';
import { MinorRevisionRequestEmailProps } from '../templates/emails/journals/MinorRevisionRequest.js';
import { OverdueAlertEditorEmailProps } from '../templates/emails/journals/OverdueAlertEditor.js';
import { RefereeAcceptedEmailProps } from '../templates/emails/journals/RefereeAccepted.js';
import { RefereeDeclinedEmailProps } from '../templates/emails/journals/RefereeDeclinedEmail.js';
import RefereeInviteEmail, { RefereeInviteEmailProps } from '../templates/emails/journals/RefereeInvite.js';
import { RefereeReassignedEmailProps } from '../templates/emails/journals/RefereeReassigned.js';
import { RefereeReviewReminderEmailProps } from '../templates/emails/journals/RefereeReviewReminder.js';
import { RevisionSubmittedEditorEmailProps } from '../templates/emails/journals/RevisionSubmittedConfirmation.js';
import { SubmissionAcceptedEmailProps } from '../templates/emails/journals/SubmissionAcceped.js';
import { SubmissionAssignedEmailProps } from '../templates/emails/journals/SubmissionAssigned.js';
import { SubmissionReassignedEmailProps } from '../templates/emails/journals/SubmissionReassigned.js';
import { DoiMintedEmailHtml, RejectedSubmissionEmailHtml } from '../templates/emails/utils/emailRenderer.js';

export enum EmailTypes {
  DoiMinted,
  DOI_REGISTRATION_REQUESTED,
  RejectedSubmission,

  // Journals
  EDITOR_INVITE,
  EXTERNAL_REFEREE_INVITE,
  REFEREE_INVITE,
  REFEREE_DECLINED,
  REFEREE_ACCEPTED,
  REFEREE_REASSIGNED,
  REFEREE_REVIEW_REMINDER,
  MINOR_REVISION_REQUEST,
  MAJOR_REVISION_REQUEST,
  REVISION_SUBMITTED,
  OVERDUE_ALERT_TO_EDITOR,
  SUBMISSION_ASSIGNED_TO_EDITOR,
  SUBMISSION_REASSIGNED_TO_EDITOR,
  SUBMISSION_ACCEPTED,
  SUBMISSION_DESK_REJECTED,
  SUBMISSION_FINAL_REJECTED,
}

// export const JournalEmailTemplates = {
//   InviteEditor: (props: InviteEditorEmailProps) => render(InviteEditorEmail(props)),
//   ExternalRefereeInvite: (props: ExternalRefereeInviteEmailProps) => render(ExternalRefereeInviteEmail(props)),
//   RefereeInvite: (props: RefereeInviteEmailProps) => render(RefereeInviteEmail(props)),
//   RefereeDeclined: (props: RefereeDeclinedEmailProps) => render(RefereeDeclinedEmail(props)),
//   RefereeAccepted: (props: RefereeAcceptedEmailProps) => render(RefereeAcceptedEmail(props)),
//   RefereeReassigned: (props: RefereeReassignedEmailProps) => render(RefereeReassignedEmail(props)),
//   RefereeReviewReminder: (props: RefereeReviewReminderEmailProps) => render(RefereeReviewReminderEmail(props)),
//   MinorRevisionRequest: (props: MinorRevisionRequestEmailProps) => render(MinorRevisionRequestEmail(props)),
//   MajorRevisionRequest: (props: MajorRevisionRequestEmailProps) => render(MajorRevisionRequestEmail(props)),
//   RevisionSubmitted: (props: RevisionSubmittedEditorEmailProps) => render(RevisionSubmittedEditorEmail(props)),
//   OverdueAlertEditor: (props: OverdueAlertEditorEmailProps) => render(OverdueAlertEditorEmail(props)),
//   SubmissionAssigned: (props: SubmissionAssignedEmailProps) => render(SubmissionAssignedEmail(props)),
//   SubmissionReassigned: (props: SubmissionReassignedEmailProps) => render(SubmissionReassignedEmail(props)),
//   SubmissionAccepted: (props: SubmissionAcceptedEmailProps) => render(SubmissionAcceptedEmail(props)),
//   DeskRejection: (props: DeskRejectionEmailProps) => render(DeskRejectionEmail(props)),
//   FinalRejectionDecision: (props: FinalRejectionDecisionEmailProps) => render(FinalRejectionDecisionEmail(props)),
// };

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

type EditorInvitePayload = {
  type: EmailTypes.EDITOR_INVITE;
  payload: { email: string } & InviteEditorEmailProps;
};

type ExternalRefereeInvitePayload = {
  type: EmailTypes.EXTERNAL_REFEREE_INVITE;
  payload: { email: string } & ExternalRefereeInviteEmailProps;
};

type RefereeInvitePayload = {
  type: EmailTypes.REFEREE_INVITE;
  payload: { email: string } & RefereeInviteEmailProps;
};

type RefereeDeclinedPayload = {
  type: EmailTypes.REFEREE_DECLINED;
  payload: { email: string } & RefereeDeclinedEmailProps;
};

type RefereeAcceptedPayload = {
  type: EmailTypes.REFEREE_ACCEPTED;
  payload: { email: string } & RefereeAcceptedEmailProps;
};

type RefereeReassignedPayload = {
  type: EmailTypes.REFEREE_REASSIGNED;
  payload: { email: string } & RefereeReassignedEmailProps;
};

type RefereeReviewReminderPayload = {
  type: EmailTypes.REFEREE_REVIEW_REMINDER;
  payload: { email: string } & RefereeReviewReminderEmailProps;
};

type MinorRevisionRequestPayload = {
  type: EmailTypes.MINOR_REVISION_REQUEST;
  payload: { email: string } & MinorRevisionRequestEmailProps;
};

type MajorRevisionRequestPayload = {
  type: EmailTypes.MAJOR_REVISION_REQUEST;
  payload: { email: string } & MajorRevisionRequestEmailProps;
};

type RevisionSubmittedPayload = {
  type: EmailTypes.REVISION_SUBMITTED;
  payload: { email: string } & RevisionSubmittedEditorEmailProps;
};

type OverdueAlertEditorPayload = {
  type: EmailTypes.OVERDUE_ALERT_TO_EDITOR;
  payload: { email: string } & OverdueAlertEditorEmailProps;
};

type SubmissionAssignedToEditorPayload = {
  type: EmailTypes.SUBMISSION_ASSIGNED_TO_EDITOR;
  payload: { email: string } & SubmissionAssignedEmailProps;
};

type SubmissionReassignedToEditorPayload = {
  type: EmailTypes.SUBMISSION_REASSIGNED_TO_EDITOR;
  payload: { email: string } & SubmissionReassignedEmailProps;
};

type SubmissionAcceptedPayload = {
  type: EmailTypes.SUBMISSION_ACCEPTED;
  payload: { email: string } & SubmissionAcceptedEmailProps;
};

type DeskRejectionPayload = {
  type: EmailTypes.SUBMISSION_DESK_REJECTED;
  payload: { email: string } & DeskRejectionEmailProps;
};

type FinalRejectionDecisionPayload = {
  type: EmailTypes.SUBMISSION_FINAL_REJECTED;
  payload: { email: string } & FinalRejectionDecisionEmailProps;
};

export type EmailProps =
  | DoiRegisteredPayload
  | DoiRequestedPayload
  | RejectSubmissionPayload
  // Journals
  | EditorInvitePayload
  | ExternalRefereeInvitePayload
  | RefereeInvitePayload
  | RefereeDeclinedPayload
  | RefereeAcceptedPayload
  | RefereeReassignedPayload
  | RefereeReviewReminderPayload
  | MinorRevisionRequestPayload
  | MajorRevisionRequestPayload
  | RevisionSubmittedPayload
  | OverdueAlertEditorPayload
  | SubmissionAssignedToEditorPayload
  | SubmissionReassignedToEditorPayload
  | SubmissionAcceptedPayload
  | DeskRejectionPayload
  | FinalRejectionDecisionPayload;

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

async function sendInviteEditorEmail({
  email,
  journal,
  inviterName,
  role,
  inviteToken,
}: EditorInvitePayload['payload']) {
  const message = {
    to: email,
    from: 'no-reply@desci.com',
    subject: `You've been invited to join ${journal.name} as ${roleCopy[role]}`,
    text: `${inviterName} has invited you to join ${journal.name} as ${roleCopy[role]}. 
    Invite Code: ${inviteToken}`,
    html: InviteEditorEmail({
      journal,
      inviterName,
      role,
      inviteToken,
    }) as unknown as string,
  };
  await sendSgMail(message, { inviteToken });
}

async function sendExternalRefereeInviteEmail({
  email,
  refereeName,
  journal,
  inviterName,
  inviteToken,
  submissionTitle,
  submissionId,
  submissionLink,
  submissionAuthors,
  submissionAbstract,
}: ExternalRefereeInvitePayload['payload']) {
  const message = {
    to: email,
    from: 'no-reply@desci.com',
    subject: `You've been invited to peer review a submission for ${journal.name}`,
    text: `${inviterName} has invited you to peer review a submission for ${journal.name}. 
    Invite Code: ${inviteToken}`,
    html: ExternalRefereeInviteEmail({
      journal,
      inviterName,
      inviteToken,
      refereeName,
      submissionTitle,
      submissionId,
      submissionLink,
      submissionAuthors,
      submissionAbstract,
    }) as unknown as string,
  };
  await sendSgMail(message, { inviteToken });
}

/**
 * Sends an email using SendGrid
 * @param devLog - Optional object with additional information to log in dev mode
 */
async function sendSgMail(message: sgMail.MailDataRequired, devLog?: Record<string, string>) {
  try {
    if (process.env.SHOULD_SEND_EMAIL) {
      const subjectPrefix =
        process.env.SERVER_URL === 'https://nodes-api.desci.com'
          ? '[nodes.desci.com]'
          : process.env.SERVER_URL === 'https://nodes-api-dev.desci.com'
            ? '[nodes-dev.desci.com]'
            : '[nodes-local-dev]';

      message.subject = `${subjectPrefix} ${message.subject}`;
      const response = await sgMail.send(message);
      logger.trace(response, '[EMAIL]:: Response');
    } else {
      logger.info({ nodeEnv: process.env.NODE_ENV }, '[EMAIL]::', message.subject);
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
        `${BIG_SIGNAL}Email sent to ${email}\n\n${BgGreen}${message.subject}${Reset}${BIG_SIGNAL}`,
      );
    }
  } catch (err) {
    logger.error({ err }, '[ERROR]:: EMAIL');
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
    case EmailTypes.EDITOR_INVITE:
      return sendInviteEditorEmail(props.payload);
    case EmailTypes.EXTERNAL_REFEREE_INVITE:
      return sendExternalRefereeInviteEmail(props.payload);
    case EmailTypes.REFEREE_INVITE:
    // NOTE: Lets not over commit on these emails, as the solution for these will likely change (mailchimp templates)
    // return sendRefereeInviteEmail(props.payload);
    case EmailTypes.REFEREE_DECLINED:
    // return sendRefereeDeclinedEmail(props.payload);
    case EmailTypes.REFEREE_ACCEPTED:
    // return sendRefereeAcceptedEmail(props.payload);
    case EmailTypes.REFEREE_REASSIGNED:
    // return sendRefereeReassignedEmail(props.payload);
    case EmailTypes.REFEREE_REVIEW_REMINDER:
    // return sendRefereeReviewReminderEmail(props.payload);
    case EmailTypes.MINOR_REVISION_REQUEST:
    // return sendMinorRevisionRequestEmail(props.payload);
    case EmailTypes.MAJOR_REVISION_REQUEST:
    // return sendMajorRevisionRequestEmail(props.payload);
    case EmailTypes.REVISION_SUBMITTED:
    // return sendRevisionSubmittedEmail(props.payload);
    case EmailTypes.OVERDUE_ALERT_TO_EDITOR:
    // return sendOverdueAlertEditorEmail(props.payload);
    case EmailTypes.SUBMISSION_ASSIGNED_TO_EDITOR:
    // return sendSubmissionAssignedToEditorEmail(props.payload);
    case EmailTypes.SUBMISSION_REASSIGNED_TO_EDITOR:
    // return sendSubmissionReassignedToEditorEmail(props.payload);
    case EmailTypes.SUBMISSION_ACCEPTED:
    // return sendSubmissionAcceptedEmail(props.payload);
    case EmailTypes.SUBMISSION_DESK_REJECTED:
    // return sendSubmissionDeskRejectedEmail(props.payload);
    case EmailTypes.SUBMISSION_FINAL_REJECTED:
      // return sendSubmissionFinalRejectedEmail(props.payload);
      // NOTE: Lets not over commit on these emails, as the solution for these will likely change (mailchimp templates)
      return;
    default:
      assertNever(props);
  }
};
