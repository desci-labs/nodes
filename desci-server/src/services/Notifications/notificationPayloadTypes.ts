import { DoiStatus, EditorRole, JournalSubmission } from '@prisma/client';
import { Journal } from '@prisma/client';

export type CommentPayload = {
  type: 'COMMENTS';
  nodeUuid: string;
  annotationId: number;
  nodeTitle: string;
  dpid: number | string | undefined;
  commentAuthor: {
    name: string;
    userId: number;
  };
};

export type PublishPayload = {
  type: 'PUBLISH';
  nodeUuid: string;
  dpid: string | number;
  nodeTitle: string;
};

export type ContributorInvitePayload = {
  type: 'CONTRIBUTOR_INVITE';
  nodeUuid: string;
  nodeTitle: string;
  dpid: number | string | undefined;
  contributorId: string;
  shareCode: string;
  inviterName: string;
  inviterId: number;
};

export type AttestationValidationPayload = {
  type: 'ATTESTATION_VALIDATION';
  nodeUuid: string;
  nodeTitle: string;
  dpid: number | string;
  claimId: number;
  attestationId: number;
  attestationVersionId: number;
  attestationName: string;
};

export type DoiIssuanceStatusPayload = {
  type: 'DOI_ISSUANCE_STATUS';
  nodeUuid: string;
  nodeTitle: string;
  dpid: number | string;
  issuanceStatus: DoiStatus;
  doi: string;
};

// Journal Notifications

export enum JournalNotificationType {
  JOURNAL_EDITOR_INVITE = 'JOURNAL_EDITOR_INVITE',
  SUBMISSION_ASSIGNED_TO_EDITOR = 'SUBMISSION_ASSIGNED_TO_EDITOR',
  SUBMISSION_REASSIGNED_TO_EDITOR = 'SUBMISSION_REASSIGNED_TO_EDITOR',
  REFEREE_INVITE = 'REFEREE_INVITE',
  REFEREE_REASSIGNED = 'REFEREE_REASSIGNED',
  REFEREE_ACCEPTED = 'REFEREE_ACCEPTED',
  REFEREE_DECLINED = 'REFEREE_DECLINED',
  REFEREE_REVIEW_REMINDER = 'REFEREE_REVIEW_REMINDER',
  MAJOR_REVISION_REQUESTED = 'MAJOR_REVISION_REQUESTED',
  MINOR_REVISION_REQUESTED = 'MINOR_REVISION_REQUESTED',
  REVISION_SUBMITTED = 'REVISION_SUBMITTED',
  SUBMISSION_DESK_REJECTION = 'SUBMISSION_DESK_REJECTION',
  SUBMISSION_FINAL_REJECTION = 'SUBMISSION_FINAL_REJECTION',
  SUBMISSION_ACCEPTED = 'SUBMISSION_ACCEPTED',
  SUBMISSION_OVERDUE_EDITOR_REMINDER = 'SUBMISSION_OVERDUE_EDITOR_REMINDER',
}

export type JournalEditorInvitePayload = {
  type: JournalNotificationType.JOURNAL_EDITOR_INVITE;
  journal: Pick<Journal, 'id' | 'name' | 'description' | 'iconCid' | 'imageUrl'>;
  role: EditorRole;
  inviterName: string;
  inviterUserId: number;
  inviteToken: string;
};

export type SubmissionAssignedToEditorPayload = {
  type: JournalNotificationType.SUBMISSION_ASSIGNED_TO_EDITOR;
  journal: Pick<Journal, 'id' | 'name' | 'description' | 'iconCid' | 'imageUrl'>;
  submission: Pick<JournalSubmission, 'id' | 'version' | 'dpid' | 'assignedEditorId' | 'submittedAt' | 'status'>;
  submissionTitle: string;
  managerName: string; // Chief who assigned the submission
  managerUserId: number;
  managerEditorId: number;
  editorName: string; // Editor who was assigned the submission
  editorUserId: number;
  journalEditorId: number;
};

export type SubmissionReassignedToEditorPayload = {
  type: JournalNotificationType.SUBMISSION_REASSIGNED_TO_EDITOR;
  journal: Pick<Journal, 'id' | 'name' | 'description' | 'iconCid' | 'imageUrl'>;
  submission: Pick<JournalSubmission, 'id' | 'version' | 'dpid' | 'assignedEditorId' | 'submittedAt' | 'status'>;
  submissionTitle: string;
  managerName: string; // Chief who assigned the submission
  managerUserId: number;
  managerEditorId: number;
  editorName: string; // Editor who was assigned the submission
  editorUserId: number;
  journalEditorId: number;
};

export type RefereeInvitePayload = {
  type: JournalNotificationType.REFEREE_INVITE;
  journal: Pick<Journal, 'id' | 'name' | 'description' | 'iconCid' | 'imageUrl'>;
  submission: Pick<JournalSubmission, 'id' | 'version' | 'dpid' | 'assignedEditorId' | 'submittedAt' | 'status'>;
  submissionTitle: string;
  editorName: string; // Editor who invited the referee
  editorUserId: number;
  refereeName: string;
  refereeUserId: number;
  dueDateHrs: number;
  inviteToken: string;
};

export type RefereeReassignedPayload = {
  // Audience: New Referee, mentions they were re-assigned.
  type: JournalNotificationType.REFEREE_REASSIGNED;
  journal: Pick<Journal, 'id' | 'name' | 'description' | 'iconCid' | 'imageUrl'>;
  submission: Pick<JournalSubmission, 'id' | 'version' | 'dpid' | 'assignedEditorId' | 'submittedAt' | 'status'>;
  submissionTitle: string;
  editorName: string; // Editor who invited the referee
  editorUserId: number;
  refereeName: string;
  refereeUserId: number;
  dueDate: Date;
};

export type RefereeAcceptedPayload = {
  type: JournalNotificationType.REFEREE_ACCEPTED;
  journal: Pick<Journal, 'id' | 'name' | 'description' | 'iconCid' | 'imageUrl'>;
  submission: Pick<JournalSubmission, 'id' | 'version' | 'dpid' | 'assignedEditorId' | 'submittedAt' | 'status'>;
  submissionTitle: string;
  refereeName: string;
  refereeUserId: number;
  dueDate: Date;
  inviteId: number;
};

export type RefereeDeclinedPayload = {
  type: JournalNotificationType.REFEREE_DECLINED;
  journal: Pick<Journal, 'id' | 'name' | 'description' | 'iconCid' | 'imageUrl'>;
  submission: Pick<JournalSubmission, 'id' | 'version' | 'dpid' | 'assignedEditorId' | 'submittedAt' | 'status'>;
  submissionTitle: string;
  refereeName?: string;
  refereeUserId?: number;
  refereeEmail: string;
  inviteId: number;
};

export type RefereeReviewReminderPayload = {
  type: JournalNotificationType.REFEREE_REVIEW_REMINDER;
  journal: Pick<Journal, 'id' | 'name' | 'description' | 'iconCid' | 'imageUrl'>;
  submission: Pick<JournalSubmission, 'id' | 'version' | 'dpid' | 'assignedEditorId' | 'submittedAt' | 'status'>;
  submissionTitle: string;
  editorName: string; // Editor who invited the referee
  editorUserId: number;
  refereeName: string;
  refereeUserId: number;
  dueDate: Date;
};

export type MajorRevisionRequestedPayload = {
  type: JournalNotificationType.MAJOR_REVISION_REQUESTED;
  journal: Pick<Journal, 'id' | 'name' | 'description' | 'iconCid' | 'imageUrl'>;
  submission: Pick<JournalSubmission, 'id' | 'version' | 'dpid' | 'assignedEditorId' | 'submittedAt' | 'status'>;
  submissionTitle: string;
  editorName: string;
  editorUserId: number;
  authorName: string;
  authorUserId: number;
};

export type MinorRevisionRequestedPayload = {
  type: JournalNotificationType.MINOR_REVISION_REQUESTED;
  journal: Pick<Journal, 'id' | 'name' | 'description' | 'iconCid' | 'imageUrl'>;
  submission: Pick<JournalSubmission, 'id' | 'version' | 'dpid' | 'assignedEditorId' | 'submittedAt' | 'status'>;
  submissionTitle: string;
  editorName: string;
  editorUserId: number;
  authorName: string;
  authorUserId: number;
};

export type RevisionSubmittedPayload = {
  type: JournalNotificationType.REVISION_SUBMITTED;
  journal: Pick<Journal, 'id' | 'name' | 'description' | 'iconCid' | 'imageUrl'>;
  submission: Pick<JournalSubmission, 'id' | 'version' | 'dpid' | 'assignedEditorId' | 'submittedAt' | 'status'>;
  submissionTitle: string;
  editorName: string;
  editorUserId: number;
  authorName: string;
  authorUserId: number;
};

export type SubmissionDeskRejectionPayload = {
  type: JournalNotificationType.SUBMISSION_DESK_REJECTION;
  journal: Pick<Journal, 'id' | 'name' | 'description' | 'iconCid' | 'imageUrl'>;
  submission: Pick<JournalSubmission, 'id' | 'version' | 'dpid' | 'assignedEditorId' | 'submittedAt' | 'status'>;
  submissionTitle: string;
  editorName: string;
  editorUserId: number;
  authorName: string;
  authorUserId: number;
};

export type SubmissionFinalRejectionPayload = {
  type: JournalNotificationType.SUBMISSION_FINAL_REJECTION;
  journal: Pick<Journal, 'id' | 'name' | 'description' | 'iconCid' | 'imageUrl'>;
  submission: Pick<JournalSubmission, 'id' | 'version' | 'dpid' | 'assignedEditorId' | 'submittedAt' | 'status'>;
  submissionTitle: string;
  editorName: string;
  editorUserId: number;
  authorName: string;
  authorUserId: number;
};

export type SubmissionAcceptedPayload = {
  type: JournalNotificationType.SUBMISSION_ACCEPTED;
  journal: Pick<Journal, 'id' | 'name' | 'description' | 'iconCid' | 'imageUrl'>;
  submission: Pick<JournalSubmission, 'id' | 'version' | 'dpid' | 'assignedEditorId' | 'submittedAt' | 'status'>;
  submissionTitle: string;
  editorName: string;
  editorUserId: number;
  authorName: string;
  authorUserId: number;
};

export type SubmissionOverdueEditorReminderPayload = {
  type: JournalNotificationType.SUBMISSION_OVERDUE_EDITOR_REMINDER;
  journal: Pick<Journal, 'id' | 'name' | 'description' | 'iconCid' | 'imageUrl'>;
  submission: Pick<JournalSubmission, 'id' | 'version' | 'dpid' | 'assignedEditorId' | 'submittedAt' | 'status'>;
  submissionTitle: string;
  editorName: string;
  editorUserId: number;
  dueDate: Date;
};
