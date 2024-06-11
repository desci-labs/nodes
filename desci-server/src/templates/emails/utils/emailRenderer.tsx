import { render } from '@react-email/components';

import AttestationClaimedEmail, { AttestationClaimedEmailProps } from '../AttestationClaimed.js';
import ContributorInvite, { ContributorInviteEmailProps } from '../ContributorInvite.js';
import MagicCodeEmail, { MagicCodeEmailProps } from '../MagicCode.js';
import NodeUpdated, { NodeUpdatedEmailProps } from '../NodeUpdated.js';

export const ContributorInviteEmailHtml = ({
  inviter,
  nodeUuid,
  privShareCode,
  contributorId,
  newUser,
}: ContributorInviteEmailProps) =>
  render(ContributorInvite({ inviter, nodeUuid, privShareCode, contributorId, newUser }));

export const MagicCodeEmailHtml = ({ magicCode, ip }: MagicCodeEmailProps) => render(MagicCodeEmail({ magicCode }));

export const AttestationClaimedEmailHtml = (props: AttestationClaimedEmailProps) =>
  render(AttestationClaimedEmail(props));

export const NodeUpdatedEmailHtml = (props: NodeUpdatedEmailProps) => render(NodeUpdated(props));
