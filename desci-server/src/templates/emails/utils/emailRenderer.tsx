import { render } from '@react-email/components';

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

export const MagicCodeEmailHtml = ({ magicCode }: MagicCodeEmailProps) => render(MagicCodeEmail({ magicCode }));
