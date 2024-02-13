import { NextFunction, Request, Response } from 'express';
import _ from 'lodash';

import { SuccessResponse, attestationService, logger as parentLogger } from '../../internal.js';

export const getAttestationReactions = async (req: Request, res: Response, next: NextFunction) => {
  const logger = parentLogger.child({
    // id: req.id,
    module: 'ATTESTATIONS::getAttestationReactions',
    user: (req as any).user,
    body: req.body,
  });
  logger.trace(`getAttestationReactions`);
  const { claimId } = req.params;
  const reactions = await attestationService.getAllClaimReactions(parseInt(claimId));

  const data = reactions.map((reaction) => {
    const author = _.pick(reaction.author, ['name', 'orcid']);
    return { ...reaction, author };
  });

  return new SuccessResponse(data).send(res);
};
