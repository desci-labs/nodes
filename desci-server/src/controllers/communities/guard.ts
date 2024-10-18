import { Response } from 'express';

// import { SuccessResponse, communityService, logger } from '../../internal.js';
import { RequestWithUser } from '../../middleware/authorisation.js';

export const checkMemberGuard = async (req: RequestWithUser, res: Response) => {
  const log = logger.child({
    module: 'ATTESTATIONS::MemberGuard',
  });
  const userId = req.user.id;
  const communityId = parseInt(req.params.communityId);

  log.info({ userId: req.user.id, community: communityId }, 'Community Member Guard check');
  const isMember = await communityService.findMemberByUserId(communityId, userId);

  if (!isMember) new SuccessResponse({ ok: false }).send(res);
  else new SuccessResponse({ ok: true }).send(res);
};
