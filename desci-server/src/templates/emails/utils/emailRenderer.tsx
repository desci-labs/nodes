import { render } from '@react-email/components';

import AttestationClaimedEmail, { AttestationClaimedEmailProps } from '../AttestationClaimed.js';
import ContributorInvite, { ContributorInviteEmailProps } from '../ContributorInvite.js';
import DoiMintedEmail, { DoiMintedEmailProps } from '../DoiMinted.js';
import ExternalPublications, { ExternalPublicationsEmailProps } from '../ExternalPublications.js';
import { DeskRejectionEmailProps } from '../journals/DeskRejection.js';
import DeskRejectionEmail from '../journals/DeskRejection.js';
import ExternalRefereeInviteEmail, { ExternalRefereeInviteEmailProps } from '../journals/ExternalRefereeInvite.js';
import { FinalRejectionDecisionEmailProps } from '../journals/FinalRejectionDecision.js';
import FinalRejectionDecisionEmail from '../journals/FinalRejectionDecision.js';
import InviteEditorEmail, { InviteEditorEmailProps } from '../journals/InviteEditor.js';
import { MajorRevisionRequestEmailProps } from '../journals/MajorRevisionRequest.js';
import MajorRevisionRequestEmail from '../journals/MajorRevisionRequest.js';
import MinorRevisionRequestEmail from '../journals/MinorRevisionRequest.js';
import { MinorRevisionRequestEmailProps } from '../journals/MinorRevisionRequest.js';
import { OverdueAlertEditorEmailProps } from '../journals/OverdueAlertEditor.js';
import OverdueAlertEditorEmail from '../journals/OverdueAlertEditor.js';
import RefereeAcceptedEmail from '../journals/RefereeAccepted.js';
import { RefereeAcceptedEmailProps } from '../journals/RefereeAccepted.js';
import RefereeDeclinedEmail, { RefereeDeclinedEmailProps } from '../journals/RefereeDeclinedEmail.js';
import RefereeInviteEmail, { RefereeInviteEmailProps } from '../journals/RefereeInvite.js';
import RefereeReassignedEmail, { RefereeReassignedEmailProps } from '../journals/RefereeReassigned.js';
import RefereeReviewReminderEmail, { RefereeReviewReminderEmailProps } from '../journals/RefereeReviewReminder.js';
import RevisionSubmittedEditorEmail, {
  RevisionSubmittedEditorEmailProps,
} from '../journals/RevisionSubmittedConfirmation.js';
import { SubmissionAcceptedEmailProps } from '../journals/SubmissionAcceped.js';
import SubmissionAcceptedEmail from '../journals/SubmissionAcceped.js';
import SubmissionAssignedEmail, { SubmissionAssignedEmailProps } from '../journals/SubmissionAssigned.js';
import SubmissionReassignedEmail, { SubmissionReassignedEmailProps } from '../journals/SubmissionReassigned.js';
import MagicCodeEmail, { MagicCodeEmailProps } from '../MagicCode.js';
import NodeUpdated, { NodeUpdatedEmailProps } from '../NodeUpdated.js';
import RejectSubmissionEmail, { RejectSubmissionEmailProps } from '../RejectSubmission.js';
import SubmissionPackage, { SubmissionPackageEmailProps } from '../SubmissionPackage.js';

export const ContributorInviteEmailHtml = ({
  inviter,
  nodeUuid,
  privShareCode,
  contributorId,
  newUser,
  nodeTitle,
}: ContributorInviteEmailProps) =>
  render(ContributorInvite({ inviter, nodeUuid, privShareCode, contributorId, newUser, nodeTitle }));

export const MagicCodeEmailHtml = ({ magicCode, ip }: MagicCodeEmailProps) => render(MagicCodeEmail({ magicCode }));

export const AttestationClaimedEmailHtml = (props: AttestationClaimedEmailProps) =>
  render(AttestationClaimedEmail(props));

export const NodeUpdatedEmailHtml = (props: NodeUpdatedEmailProps) => render(NodeUpdated(props));

export const SubmissionPackageEmailHtml = (props: SubmissionPackageEmailProps) => render(SubmissionPackage(props));

export const ExternalPublicationsEmailHtml = (props: ExternalPublicationsEmailProps) =>
  render(ExternalPublications(props));

export const DoiMintedEmailHtml = (props: DoiMintedEmailProps) => render(DoiMintedEmail(props));

export const RejectedSubmissionEmailHtml = (props: RejectSubmissionEmailProps) => render(RejectSubmissionEmail(props));

export const JournalEmailTemplates = {
  InviteEditor: (props: InviteEditorEmailProps) => render(InviteEditorEmail(props)),
  ExternalRefereeInvite: (props: ExternalRefereeInviteEmailProps) => render(ExternalRefereeInviteEmail(props)),
  RefereeInvite: (props: RefereeInviteEmailProps) => render(RefereeInviteEmail(props)),
  RefereeDeclined: (props: RefereeDeclinedEmailProps) => render(RefereeDeclinedEmail(props)),
  RefereeAccepted: (props: RefereeAcceptedEmailProps) => render(RefereeAcceptedEmail(props)),
  RefereeReassigned: (props: RefereeReassignedEmailProps) => render(RefereeReassignedEmail(props)),
  RefereeReviewReminder: (props: RefereeReviewReminderEmailProps) => render(RefereeReviewReminderEmail(props)),
  MinorRevisionRequest: (props: MinorRevisionRequestEmailProps) => render(MinorRevisionRequestEmail(props)),
  MajorRevisionRequest: (props: MajorRevisionRequestEmailProps) => render(MajorRevisionRequestEmail(props)),
  RevisionSubmitted: (props: RevisionSubmittedEditorEmailProps) => render(RevisionSubmittedEditorEmail(props)),
  OverdueAlertEditor: (props: OverdueAlertEditorEmailProps) => render(OverdueAlertEditorEmail(props)),
  SubmissionAssigned: (props: SubmissionAssignedEmailProps) => render(SubmissionAssignedEmail(props)),
  SubmissionReassigned: (props: SubmissionReassignedEmailProps) => render(SubmissionReassignedEmail(props)),
  SubmissionAccepted: (props: SubmissionAcceptedEmailProps) => render(SubmissionAcceptedEmail(props)),
  DeskRejection: (props: DeskRejectionEmailProps) => render(DeskRejectionEmail(props)),
  FinalRejectionDecision: (props: FinalRejectionDecisionEmailProps) => render(FinalRejectionDecisionEmail(props)),
};
