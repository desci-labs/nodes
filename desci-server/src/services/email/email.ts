import { EditorRole } from '@prisma/client';
import sgMail from '@sendgrid/mail';

import { SHOULD_SEND_EMAIL } from '../../config.js';
import { logger as parentLogger } from '../../logger.js';
import { DoiMintedEmailHtml, RejectedSubmissionEmailHtml } from '../../templates/emails/utils/emailRenderer.js';
import { getRelativeTime } from '../../utils/clock.js';
import { DeploymentEnvironment, getDeploymentEnvironment, prependIndefiniteArticle } from '../../utils.js';

import {
  EditorInvitePayload,
  ExternalRefereeInvitePayload,
  RefereeInvitePayload,
  RefereeDeclinedPayload,
  RefereeAcceptedPayload,
  RefereeReassignedPayload,
  RefereeReviewReminderPayload,
  MinorRevisionRequestPayload,
  MajorRevisionRequestPayload,
  RevisionSubmittedPayload,
  OverdueAlertEditorPayload,
  SubmissionAssignedToEditorPayload,
  SubmissionReassignedToEditorPayload,
  SubmissionAcceptedPayload,
  DeskRejectionPayload,
  FinalRejectionDecisionPayload,
  SubmissionExtended,
} from './journalEmailTypes.js';
import { sendSciweaveEmailService } from './sciweaveEmails.js';
import { SciweaveEmailProps, SciweaveEmailTypes } from './sciweaveEmailTypes.js';

/**
 * Used to add a suffix to the email subject to indicate the deployment environment
 * e.g. [nodes-dev.desci.com], [nodes.desci.com]
 */
const deploymentEnvironmentString =
  process.env.SERVER_URL === 'https://nodes-api.desci.com'
    ? '' // Prod wouldn't need a prefix
    : process.env.SERVER_URL === 'https://nodes-api-dev.desci.com'
      ? '-dev'
      : '-local';

/**
 * Formats an authors array for email display.
 * Takes up to 3 authors, separates them with commas, and adds "et al." if there are more than 3.
 * @param authors - Array of author names
 * @returns Formatted author string
 */
export const formatAuthorsForEmail = (authors: string[]): string => {
  if (!authors || authors.length === 0) {
    return '';
  }

  if (authors.length <= 3) {
    return authors.join(', ');
  }

  return `${authors.slice(0, 3).join(', ')}, et al.`;
};

/**
 * Creates a submission object with formatted authors for email templates.
 * @param submission - Original submission object
 * @returns Submission object with formatted authors string
 */
const formatSubmissionForEmail = (submission: SubmissionExtended) => ({
  ...submission,
  authors: formatAuthorsForEmail(submission.authors),
});

export enum EmailTypes {
  DoiMinted = 'DoiMinted',
  DOI_REGISTRATION_REQUESTED = 'DOI_REGISTRATION_REQUESTED',
  RejectedSubmission = 'RejectedSubmission',

  // Journals
  EDITOR_INVITE = 'EDITOR_INVITE',
  ASSOCIATE_EDITOR_INVITE = 'ASSOCIATE_EDITOR_INVITE',
  CHIEF_EDITOR_INVITE = 'CHIEF_EDITOR_INVITE',
  EXTERNAL_REFEREE_INVITE = 'EXTERNAL_REFEREE_INVITE',
  REFEREE_INVITE = 'REFEREE_INVITE',
  REFEREE_DECLINED = 'REFEREE_DECLINED',
  REFEREE_ACCEPTED = 'REFEREE_ACCEPTED',
  REFEREE_REASSIGNED = 'REFEREE_REASSIGNED',
  REFEREE_REVIEW_REMINDER = 'REFEREE_REVIEW_REMINDER',
  MINOR_REVISION_REQUEST = 'MINOR_REVISION_REQUEST',
  MAJOR_REVISION_REQUEST = 'MAJOR_REVISION_REQUEST',
  REVISION_SUBMITTED = 'REVISION_SUBMITTED',
  OVERDUE_ALERT_TO_EDITOR = 'OVERDUE_ALERT_TO_EDITOR',
  SUBMISSION_ASSIGNED_TO_EDITOR = 'SUBMISSION_ASSIGNED_TO_EDITOR',
  SUBMISSION_REASSIGNED_TO_EDITOR = 'SUBMISSION_REASSIGNED_TO_EDITOR',
  SUBMISSION_ACCEPTED = 'SUBMISSION_ACCEPTED',
  SUBMISSION_DESK_REJECTED = 'SUBMISSION_DESK_REJECTED',
  SUBMISSION_FINAL_REJECTED = 'SUBMISSION_FINAL_REJECTED',
}

const templateIdMap = process.env.SENDGRID_TEMPLATE_ID_MAP
  ? (JSON.parse(process.env.SENDGRID_TEMPLATE_ID_MAP ?? '{}') as Record<EmailTypes, string>)
  : {};

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
  | FinalRejectionDecisionPayload
  // Sciweave
  | SciweaveEmailProps;

const logger = parentLogger.child({ module: 'EmailService' });

const deploymentEnvironment = getDeploymentEnvironment();
export const NODES_SUBJECT_PREFIX =
  deploymentEnvironment === DeploymentEnvironment.PROD
    ? '[nodes.desci.com]'
    : deploymentEnvironment === DeploymentEnvironment.DEV
      ? '[nodes-dev.desci.com]'
      : '[nodes-local-dev]';

/**
 * Sends an email using SendGrid
 * @param devLog - Optional object with additional information to log in dev mode
 */
async function sendSgMail(message: sgMail.MailDataRequired, devLog?: Record<string, string>) {
  try {
    if (SHOULD_SEND_EMAIL) {
      message.subject = `${NODES_SUBJECT_PREFIX} ${message.subject}`;
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
    subject: `${NODES_SUBJECT_PREFIX} Your submission to ${communityName} for DPID://${nodeDpid}/v${nodeVersion} was rejected `,
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

  await sendSgMail(message);
}

export type EditorInviteDynamicTemplateData = {
  journal: {
    id: number;
    name: string;
    description: string;
    iconCid: string;
    imageUrl?: string;
  };
  inviter: {
    name: string;
  };
  role: string;
  roleWithArticle: string;
  inviteToken: string;
};

async function sendInviteEditorEmail({
  email,
  journal,
  inviterName,
  recipientName,
  role,
  inviteToken,
}: EditorInvitePayload['payload']) {
  // We separated out the Associate Editor invite and the Chief Editor emails, as they have different copies.
  // Both have different templateIds.
  const emailType =
    role === EditorRole.CHIEF_EDITOR ? EmailTypes.CHIEF_EDITOR_INVITE : EmailTypes.ASSOCIATE_EDITOR_INVITE;
  const templateId = templateIdMap[emailType];

  const message = {
    to: email,
    from: 'no-reply@desci.com',
    templateId,
    dynamicTemplateData: {
      envSuffix: deploymentEnvironmentString,
      journal: {
        id: journal.id,
        name: journal.name,
        description: journal.description,
        iconCid: journal.iconCid,
        imageUrl: journal.imageUrl,
      },
      inviter: {
        name: inviterName,
      },
      recipient: {
        name: recipientName,
      },
      role: role === EditorRole.CHIEF_EDITOR ? 'Chief Editor' : 'Associate Editor',
      roleWithArticle: prependIndefiniteArticle(role === EditorRole.CHIEF_EDITOR ? 'Chief Editor' : 'Associate Editor'),
      inviteToken,
    },
  };
  await sendSgMail(message, { inviteToken });
}

async function sendExternalRefereeInviteEmail({
  email,
  refereeName,
  journal,
  inviterName,
  inviteToken,
  submission,
}: ExternalRefereeInvitePayload['payload']) {
  const message = {
    to: email,
    from: 'no-reply@desci.com',
    templateId: templateIdMap[EmailTypes.EXTERNAL_REFEREE_INVITE],
    dynamicTemplateData: {
      envSuffix: deploymentEnvironmentString,
      journal: {
        id: journal.id,
        name: journal.name,
        description: journal.description,
        iconCid: journal.iconCid,
        imageUrl: journal.imageUrl,
      },
      inviter: {
        name: inviterName,
      },
      referee: {
        name: refereeName,
      },
      submission: {
        title: submission.title,
        id: submission.id,
        dpid: submission.dpid,
        authors: formatAuthorsForEmail(submission.authors),
        abstract: submission.abstract,
      },
      inviteToken,
    },
  };
  await sendSgMail(message, { inviteToken });
}

async function sendRefereeDeclinedEmail({
  email,
  journal,
  editorName,
  refereeName,
  refereeEmail,
  submission,
  declineReason,
  suggestedReferees,
}: RefereeDeclinedPayload['payload']) {
  const submittedAtFromNow = getRelativeTime(submission.submittedAt);
  const message = {
    to: email,
    from: 'no-reply@desci.com',
    templateId: templateIdMap[EmailTypes.REFEREE_DECLINED],
    dynamicTemplateData: {
      envSuffix: deploymentEnvironmentString,
      journal: {
        id: journal.id,
        name: journal.name,
        description: journal.description,
        iconCid: journal.iconCid,
        imageUrl: journal.imageUrl,
      },
      editor: {
        name: editorName,
      },
      referee: {
        name: refereeName,
        email: refereeEmail,
      },
      submission: formatSubmissionForEmail(submission),
      declineReason,
      suggestedReferees,
      submittedAtFromNow,
    },
  };
  await sendSgMail(message);
}

async function sendRefereeAcceptedEmail({
  email,
  journal,
  refereeName,
  refereeEmail,
  submission,
  reviewDeadline,
}: RefereeAcceptedPayload['payload']) {
  const deadlineFromNow = getRelativeTime(new Date(reviewDeadline));
  const submittedAtFromNow = getRelativeTime(submission.submittedAt);
  const message = {
    to: email,
    from: 'no-reply@desci.com',
    templateId: templateIdMap[EmailTypes.REFEREE_ACCEPTED],
    dynamicTemplateData: {
      envSuffix: deploymentEnvironmentString,
      journal: {
        id: journal.id,
        name: journal.name,
        description: journal.description,
        iconCid: journal.iconCid,
        imageUrl: journal.imageUrl,
      },
      editor: {
        name: submission.assignedEditor.name,
      },
      referee: {
        name: refereeName,
        email: refereeEmail,
      },
      submission: formatSubmissionForEmail(submission),
      reviewDeadline,
      deadlineFromNow,
      submittedAtFromNow,
    },
  };
  await sendSgMail(message);
}

async function sendRefereeReassignedEmail({
  email,
  journal,
  refereeName,
  refereeEmail,
  submission,
  reviewDeadline,
}: RefereeReassignedPayload['payload']) {
  const deadlineFromNow = getRelativeTime(new Date(reviewDeadline));
  const submittedAtFromNow = getRelativeTime(submission.submittedAt);
  const message = {
    to: email,
    from: 'no-reply@desci.com',
    templateId: templateIdMap[EmailTypes.REFEREE_REASSIGNED],
    dynamicTemplateData: {
      envSuffix: deploymentEnvironmentString,
      journal: {
        id: journal.id,
        name: journal.name,
        description: journal.description,
        iconCid: journal.iconCid,
        imageUrl: journal.imageUrl,
      },
      referee: {
        name: refereeName,
        email: refereeEmail,
      },
      editor: {
        name: submission.assignedEditor.name,
      },
      submission: formatSubmissionForEmail(submission),
      reviewDeadline,
      deadlineFromNow,
      submittedAtFromNow,
    },
  };
  await sendSgMail(message);
}

async function sendRefereeReviewReminderEmail({
  email,
  refereeName,
  journal,
  submission,
  reviewDeadline,
}: RefereeReviewReminderPayload['payload']) {
  const deadlineFromNow = getRelativeTime(new Date(reviewDeadline));
  const submittedAtFromNow = getRelativeTime(submission.submittedAt);
  const message = {
    to: email,
    from: 'no-reply@desci.com',
    templateId: templateIdMap[EmailTypes.REFEREE_REVIEW_REMINDER],
    dynamicTemplateData: {
      envSuffix: deploymentEnvironmentString,
      journal: {
        id: journal.id,
        name: journal.name,
        description: journal.description,
        iconCid: journal.iconCid,
        imageUrl: journal.imageUrl,
      },
      editor: {
        name: submission.assignedEditor.name,
      },
      referee: {
        name: refereeName,
        email: email,
      },
      submission: formatSubmissionForEmail(submission),
      reviewDeadline,
      deadlineFromNow,
      submittedAtFromNow,
    },
  };
  await sendSgMail(message);
}

async function sendMinorRevisionRequestEmail({
  email,
  journal,
  submission,
  editor,
  comments,
}: MinorRevisionRequestPayload['payload']) {
  const message = {
    to: email,
    from: 'no-reply@desci.com',
    templateId: templateIdMap[EmailTypes.MINOR_REVISION_REQUEST],
    dynamicTemplateData: {
      envSuffix: deploymentEnvironmentString,
      journal: {
        id: journal.id,
        name: journal.name,
        description: journal.description,
        iconCid: journal.iconCid,
        imageUrl: journal.imageUrl,
      },
      editor: {
        name: editor.name,
        userId: editor.userId,
      },
      submission: formatSubmissionForEmail(submission),
      comments,
    },
  };
  await sendSgMail(message);
}

async function sendMajorRevisionRequestEmail({
  email,
  journal,
  submission,
  editor,
  comments,
}: MajorRevisionRequestPayload['payload']) {
  const message = {
    to: email,
    from: 'no-reply@desci.com',
    templateId: templateIdMap[EmailTypes.MAJOR_REVISION_REQUEST],
    dynamicTemplateData: {
      envSuffix: deploymentEnvironmentString,
      journal: {
        id: journal.id,
        name: journal.name,
        description: journal.description,
        iconCid: journal.iconCid,
        imageUrl: journal.imageUrl,
      },
      editor: {
        name: editor.name,
        userId: editor.userId,
      },
      submission: formatSubmissionForEmail(submission),
      comments,
    },
  };
  await sendSgMail(message);
}

async function sendRevisionSubmittedEmail({ email, journal, submission }: RevisionSubmittedPayload['payload']) {
  const message = {
    to: email,
    from: 'no-reply@desci.com',
    templateId: templateIdMap[EmailTypes.REVISION_SUBMITTED],
    dynamicTemplateData: {
      envSuffix: deploymentEnvironmentString,
      author: {
        name: submission.author.name || 'Author',
      },
      editor: {
        name: submission.assignedEditor.name,
      },
      journal: {
        id: journal.id,
        name: journal.name,
        description: journal.description,
        iconCid: journal.iconCid,
        imageUrl: journal.imageUrl,
      },
      submission: formatSubmissionForEmail(submission),
    },
  };
  await sendSgMail(message);
}

async function sendOverdueAlertEditorEmail({
  email,
  journal,
  reviewDeadline,
  submission,
}: OverdueAlertEditorPayload['payload']) {
  const deadlineFromNow = getRelativeTime(new Date(reviewDeadline));
  const overdueInDays = Math.ceil((new Date().getTime() - new Date(reviewDeadline).getTime()) / (1000 * 60 * 60 * 24));
  const overdueDays = overdueInDays === 1 ? '1 day' : `${overdueInDays} days`;
  const message = {
    to: email,
    from: 'no-reply@desci.com',
    templateId: templateIdMap[EmailTypes.OVERDUE_ALERT_TO_EDITOR],
    dynamicTemplateData: {
      envSuffix: deploymentEnvironmentString,
      editor: {
        name: submission.assignedEditor.name,
      },
      journal: {
        id: journal.id,
        name: journal.name,
        description: journal.description,
        iconCid: journal.iconCid,
        imageUrl: journal.imageUrl,
      },
      submission,
      reviewDeadline,
      deadlineFromNow,
      overdueDays,
    },
  };
  await sendSgMail(message);
}

async function sendSubmissionAssignedToEditorEmail({
  email,
  journal,
  assigner,
  editor,
  submission,
}: SubmissionAssignedToEditorPayload['payload']) {
  const submittedAtFromNow = getRelativeTime(submission.submittedAt);
  const message = {
    to: email,
    from: 'no-reply@desci.com',
    templateId: templateIdMap[EmailTypes.SUBMISSION_ASSIGNED_TO_EDITOR],
    dynamicTemplateData: {
      envSuffix: deploymentEnvironmentString,
      journal: {
        id: journal.id,
        name: journal.name,
        description: journal.description,
        iconCid: journal.iconCid,
        imageUrl: journal.imageUrl,
      },
      submission,
      assigner: {
        name: assigner.name,
        userId: assigner.userId,
      },
      editor: {
        name: editor.name,
        userId: editor.userId,
      },
      submittedAtFromNow,
    },
  };
  await sendSgMail(message);
}

async function sendSubmissionAcceptedEmail({
  email,
  journal,
  editor,
  submission,
}: SubmissionAcceptedPayload['payload']) {
  const submittedAtFromNow = getRelativeTime(submission.submittedAt);
  const message = {
    to: email,
    from: 'no-reply@desci.com',
    templateId: templateIdMap[EmailTypes.SUBMISSION_ACCEPTED],
    dynamicTemplateData: {
      envSuffix: deploymentEnvironmentString,
      journal: {
        id: journal.id,
        name: journal.name,
        description: journal.description,
        iconCid: journal.iconCid,
        imageUrl: journal.imageUrl,
      },
      author: {
        name: submission.author.name || 'Researcher',
      },
      submission,
      editor: {
        name: editor.name,
        userId: editor.userId,
      },
      submittedAtFromNow,
    },
  };
  await sendSgMail(message);
}

async function sendSubmissionDeskRejectedEmail({
  email,
  journal,
  editor,
  submission,
  comments,
}: DeskRejectionPayload['payload']) {
  const submittedAtFromNow = getRelativeTime(submission.submittedAt);
  const message = {
    to: email,
    from: 'no-reply@desci.com',
    templateId: templateIdMap[EmailTypes.SUBMISSION_DESK_REJECTED],
    dynamicTemplateData: {
      envSuffix: deploymentEnvironmentString,
      journal: {
        id: journal.id,
        name: journal.name,
        description: journal.description,
        iconCid: journal.iconCid,
        imageUrl: journal.imageUrl,
      },
      author: {
        name: submission.author.name || 'Researcher',
      },
      submission,
      editor: {
        name: editor.name,
        userId: editor.userId,
      },
      comments: comments || 'No comments provided',
      submittedAtFromNow,
    },
  };
  await sendSgMail(message);
}

async function sendSubmissionFinalRejectedEmail({
  email,
  journal,
  editor,
  submission,
  comments,
}: FinalRejectionDecisionPayload['payload']) {
  const submittedAtFromNow = getRelativeTime(submission.submittedAt);
  const message = {
    to: email,
    from: 'no-reply@desci.com',
    templateId: templateIdMap[EmailTypes.SUBMISSION_FINAL_REJECTED],
    dynamicTemplateData: {
      envSuffix: deploymentEnvironmentString,
      journal: {
        id: journal.id,
        name: journal.name,
        description: journal.description,
        iconCid: journal.iconCid,
        imageUrl: journal.imageUrl,
      },
      author: {
        name: submission.author.name || 'Researcher',
      },
      submission,
      editor: {
        name: editor.name,
        userId: editor.userId,
      },
      comments,
      submittedAtFromNow,
    },
  };
  await sendSgMail(message);
}

export const sendEmail = async (props: EmailProps) => {
  switch (props.type) {
    case EmailTypes.DoiMinted:
      return sendDoiRegisteredEmail(props.payload);
    case EmailTypes.DOI_REGISTRATION_REQUESTED:
      return sendDoiRequested(props.payload);
    case EmailTypes.RejectedSubmission:
      return sendRejectSubmissionEmail(props.payload);

    // JOURNALS
    case EmailTypes.EDITOR_INVITE:
      return sendInviteEditorEmail(props.payload);
    case EmailTypes.EXTERNAL_REFEREE_INVITE:
      return sendExternalRefereeInviteEmail(props.payload);
    case EmailTypes.REFEREE_INVITE:
      return sendExternalRefereeInviteEmail(props.payload); // Change if copy is different
    case EmailTypes.REFEREE_DECLINED:
      return sendRefereeDeclinedEmail(props.payload);
    case EmailTypes.REFEREE_ACCEPTED:
      return sendRefereeAcceptedEmail(props.payload);
    case EmailTypes.REFEREE_REASSIGNED:
      return sendRefereeReassignedEmail(props.payload); // Removed for now, prod mentioned not used.
    case EmailTypes.REFEREE_REVIEW_REMINDER:
      return sendRefereeReviewReminderEmail(props.payload);
    case EmailTypes.MINOR_REVISION_REQUEST:
      return sendMinorRevisionRequestEmail(props.payload);
    case EmailTypes.MAJOR_REVISION_REQUEST:
      return sendMajorRevisionRequestEmail(props.payload);
    case EmailTypes.REVISION_SUBMITTED:
      return sendRevisionSubmittedEmail(props.payload);
    case EmailTypes.OVERDUE_ALERT_TO_EDITOR:
      return sendOverdueAlertEditorEmail(props.payload);
    case EmailTypes.SUBMISSION_ASSIGNED_TO_EDITOR:
      return sendSubmissionAssignedToEditorEmail(props.payload);
    case EmailTypes.SUBMISSION_REASSIGNED_TO_EDITOR:
      return sendSubmissionAssignedToEditorEmail(props.payload); // Change if copy is different to SUBMISSION_ASSIGNED_TO_EDITOR
    // return sendSubmissionReassignedToEditorEmail(props.payload);
    case EmailTypes.SUBMISSION_ACCEPTED:
      return sendSubmissionAcceptedEmail(props.payload);
    case EmailTypes.SUBMISSION_DESK_REJECTED:
      return sendSubmissionDeskRejectedEmail(props.payload);
    case EmailTypes.SUBMISSION_FINAL_REJECTED:
      return sendSubmissionFinalRejectedEmail(props.payload);

    // SCIWEAVE
    case SciweaveEmailTypes.SCIWEAVE_WELCOME_EMAIL:
    case SciweaveEmailTypes.SCIWEAVE_UPGRADE_EMAIL:
    case SciweaveEmailTypes.SCIWEAVE_CANCELLATION_EMAIL:
    case SciweaveEmailTypes.SCIWEAVE_SUBSCRIPTION_ENDED:
    case SciweaveEmailTypes.SCIWEAVE_ANNUAL_UPSELL:
    case SciweaveEmailTypes.SCIWEAVE_CHECKOUT_1_HOUR:
    case SciweaveEmailTypes.SCIWEAVE_CHECKOUT_1_DAY_REMAINING:
    case SciweaveEmailTypes.SCIWEAVE_14_DAY_INACTIVITY:
    case SciweaveEmailTypes.SCIWEAVE_OUT_OF_CHATS_INITIAL:
    case SciweaveEmailTypes.SCIWEAVE_OUT_OF_CHATS_CTA_CLICKED:
    case SciweaveEmailTypes.SCIWEAVE_OUT_OF_CHATS_NO_CTA:
    case SciweaveEmailTypes.SCIWEAVE_PRO_CHAT_REFRESH:
    case SciweaveEmailTypes.SCIWEAVE_STUDENT_DISCOUNT:
    case SciweaveEmailTypes.SCIWEAVE_STUDENT_DISCOUNT_LIMIT_REACHED:
    case SciweaveEmailTypes.SCIWEAVE_NEW_USER_3_DAY:
      return sendSciweaveEmailService(props);

    default:
      assertNever(props);
  }
};
