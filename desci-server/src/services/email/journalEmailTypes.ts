import { ResearchObjectV1 } from '@desci-labs/desci-models';
import { JournalSubmission } from '@prisma/client';

import { DeskRejectionEmailProps } from '../../templates/emails/journals/DeskRejection.js';
import { ExternalRefereeInviteEmailProps } from '../../templates/emails/journals/ExternalRefereeInvite.js';
import { FinalRejectionDecisionEmailProps } from '../../templates/emails/journals/FinalRejectionDecision.js';
import { InviteEditorEmailProps } from '../../templates/emails/journals/InviteEditor.js';
import { MajorRevisionRequestEmailProps } from '../../templates/emails/journals/MajorRevisionRequest.js';
import { MinorRevisionRequestEmailProps } from '../../templates/emails/journals/MinorRevisionRequest.js';
import { OverdueAlertEditorEmailProps } from '../../templates/emails/journals/OverdueAlertEditor.js';
import { RefereeAcceptedEmailProps } from '../../templates/emails/journals/RefereeAccepted.js';
import { RefereeDeclinedEmailProps } from '../../templates/emails/journals/RefereeDeclinedEmail.js';
import { RefereeInviteEmailProps } from '../../templates/emails/journals/RefereeInvite.js';
import { RefereeReassignedEmailProps } from '../../templates/emails/journals/RefereeReassigned.js';
import { RefereeReviewReminderEmailProps } from '../../templates/emails/journals/RefereeReviewReminder.js';
import { RevisionSubmittedEditorEmailProps } from '../../templates/emails/journals/RevisionSubmittedConfirmation.js';
import { SubmissionAcceptedEmailProps } from '../../templates/emails/journals/SubmissionAcceped.js';
import { SubmissionAssignedEmailProps } from '../../templates/emails/journals/SubmissionAssigned.js';
import { SubmissionReassignedEmailProps } from '../../templates/emails/journals/SubmissionReassigned.js';

import { EmailTypes } from './email.js';

export type SubmissionPartial = Pick<JournalSubmission, 'id' | 'dpid' | 'version' | 'doi' | 'submittedAt'>;
export type SubmissionExtended = SubmissionPartial & {
  title: string;
  authors: string[];
  abstract: string;
  submitterName: string;
  submitterUserId: number;
  // included for convenience in the db query
  journal: {
    id: number;
    name: string;
  };
  node: {
    title: string;
    uuid: string;
  };
  author: {
    name: string;
    id: number;
    orcid: string;
  };
  assignedEditor: {
    id: number;
    name: string;
    orcid: string;
  };
};

export type SubmissionDetails = SubmissionPartial & {
  researchObject: {
    title: string;
    uuid: string;
    doi: string;
    manifest: ResearchObjectV1;
  };
  // included for convenience in the db query
  journal: {
    id: number;
    name: string;
  };
  author: {
    name: string;
    id: number;
    orcid: string;
  };
  assignedEditor: {
    id: number;
    name: string;
    orcid: string;
  };
};

export type EditorInvitePayload = {
  type: EmailTypes.EDITOR_INVITE;
  payload: { email: string } & InviteEditorEmailProps;
};

export type ExternalRefereeInvitePayload = {
  type: EmailTypes.EXTERNAL_REFEREE_INVITE;
  payload: { email: string } & ExternalRefereeInviteEmailProps;
};

export type RefereeInvitePayload = {
  type: EmailTypes.REFEREE_INVITE;
  payload: { email: string } & RefereeInviteEmailProps;
};

export type RefereeDeclinedPayload = {
  type: EmailTypes.REFEREE_DECLINED;
  payload: { email: string } & RefereeDeclinedEmailProps;
};

export type RefereeAcceptedPayload = {
  type: EmailTypes.REFEREE_ACCEPTED;
  payload: { email: string } & RefereeAcceptedEmailProps;
};

export type RefereeReassignedPayload = {
  type: EmailTypes.REFEREE_REASSIGNED;
  payload: { email: string } & RefereeReassignedEmailProps;
};

export type RefereeReviewReminderPayload = {
  type: EmailTypes.REFEREE_REVIEW_REMINDER;
  payload: { email: string } & RefereeReviewReminderEmailProps;
};

export type MinorRevisionRequestPayload = {
  type: EmailTypes.MINOR_REVISION_REQUEST;
  payload: { email: string } & MinorRevisionRequestEmailProps;
};

export type MajorRevisionRequestPayload = {
  type: EmailTypes.MAJOR_REVISION_REQUEST;
  payload: { email: string } & MajorRevisionRequestEmailProps;
};

export type RevisionSubmittedPayload = {
  type: EmailTypes.REVISION_SUBMITTED;
  payload: { email: string } & RevisionSubmittedEditorEmailProps;
};

export type OverdueAlertEditorPayload = {
  type: EmailTypes.OVERDUE_ALERT_TO_EDITOR;
  payload: { email: string } & OverdueAlertEditorEmailProps;
};

export type SubmissionAssignedToEditorPayload = {
  type: EmailTypes.SUBMISSION_ASSIGNED_TO_EDITOR;
  payload: { email: string } & SubmissionAssignedEmailProps;
};

export type SubmissionReassignedToEditorPayload = {
  type: EmailTypes.SUBMISSION_REASSIGNED_TO_EDITOR;
  payload: { email: string } & SubmissionReassignedEmailProps;
};

export type SubmissionAcceptedPayload = {
  type: EmailTypes.SUBMISSION_ACCEPTED;
  payload: { email: string } & SubmissionAcceptedEmailProps;
};

export type DeskRejectionPayload = {
  type: EmailTypes.SUBMISSION_DESK_REJECTED;
  payload: { email: string } & DeskRejectionEmailProps;
};

export type FinalRejectionDecisionPayload = {
  type: EmailTypes.SUBMISSION_FINAL_REJECTED;
  payload: { email: string } & FinalRejectionDecisionEmailProps;
};
