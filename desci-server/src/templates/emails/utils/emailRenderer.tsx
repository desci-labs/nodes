import { render } from '@react-email/components';

import { AttestationClaimedEmailProps } from '../AttestationClaimed.js';
import ContributorInvite, { ContributorInviteEmailProps } from '../ContributorInvite.js';
import MagicCodeEmail, { MagicCodeEmailProps } from '../MagicCode.js';

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
  render(AttestationClaimedEmailHtml(props));
