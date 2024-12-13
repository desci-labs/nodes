import { render } from '@react-email/components';

import AttestationClaimedEmail, { AttestationClaimedEmailProps } from '../AttestationClaimed.js';
import ContributorInvite, { ContributorInviteEmailProps } from '../ContributorInvite.js';
import DoiMintedEmail, { DoiMintedEmailProps } from '../DoiMinted.js';
import MagicCodeEmail, { MagicCodeEmailProps } from '../MagicCode.js';
import NodeUpdated, { NodeUpdatedEmailProps } from '../NodeUpdated.js';
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

export const DoiMintedEmailHtml = (props: DoiMintedEmailProps) => render(DoiMintedEmail(props));
