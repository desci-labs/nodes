import { NextFunction, Request, Response } from 'express';
import _ from 'lodash';

import { ForbiddenError } from '../../core/ApiError.js';
import { SuccessMessageResponse, SuccessResponse } from '../../core/ApiResponse.js';
import { logger as parentLogger } from '../../logger.js';
import { attestationService } from '../../services/Attestation.js';

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

type AddReactionRequestBody = {
  claimId: string;
  reaction: string;
};

type AddReactionResponse = {
  ok: boolean;
  error?: string;
};

export const addReaction = async (
  req: Request<any, any, AddReactionRequestBody>,
  res: Response<AddReactionResponse>,
) => {
  const logger = parentLogger.child({
    module: 'ATTESTATIONS::addReaction',
    user: (req as any).user,
    body: req.body,
  });

  const { claimId, reaction } = req.body;
  const user = (req as any).user;

  logger.trace(`addReaction`);

  const data = await attestationService.createReaction({
    claimId: parseInt(claimId),
    userId: user.id,
    reaction,
  });
  new SuccessResponse(data).send(res);
};

type RemoveReactionBody = {
  reactionId: string;
};

export const removeReaction = async (req: Request<RemoveReactionBody, any, any>, res: Response) => {
  const { reactionId } = req.params;
  const user = (req as any).user;

  const logger = parentLogger.child({
    // id: req.id,
    module: 'ATTESTATIONS::removeReaction',
    user: (req as any).user,
    body: req.body,
  });
  logger.trace(`removeReaction`);
  // if (!claimId || !reactionId) throw new BadRequestError('ClaimId and reactionId are required');

  const reactionEntry = await attestationService.findReaction({ id: parseInt(reactionId) });
  if (reactionEntry.authorId !== user.id) throw new ForbiddenError();
  if (!reactionEntry) {
    new SuccessMessageResponse().send(res); // throw new NotFoundError('Reaction not found'); // return res.status(404).send({ ok: false, error: 'Reaction not found' });
  } else {
    await attestationService.removeReaction(reactionEntry.id);
    new SuccessMessageResponse().send(res);
  }
};
