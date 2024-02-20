import { NextFunction, Request, Response } from 'express';
import _ from 'lodash';

import {
  BadRequestError,
  ForbiddenError,
  NotFoundError,
  SuccessMessageResponse,
  SuccessResponse,
  attestationService,
  logger as parentLogger,
} from '../../internal.js';

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

const EMOJI_OPTIONS = ['U+2705', 'U+1F914', 'U+1F440'];

export const addReaction = async (
  req: Request<any, any, AddReactionRequestBody>,
  res: Response<AddReactionResponse>,
) => {
  const logger = parentLogger.child({
    // id: req.id,
    module: 'ATTESTATIONS::addReaction',
    user: (req as any).user,
    body: req.body,
  });

  const { claimId, reaction } = req.body;
  const user = (req as any).user;

  logger.trace(`addReaction`);
  if (!claimId || !reaction) throw new BadRequestError('Claim ID and reaction are required');
  // return res.status(400).send({ ok: false, error: 'Claim ID is required' });
  // if (!reaction) return res.status(400).send({ ok: false, error: 'Reaction is required' });

  if (!EMOJI_OPTIONS.includes(reaction)) throw new BadRequestError('Emoji not allowed');
  await attestationService.createReaction({
    claimId: parseInt(claimId),
    userId: user.id,
    reaction,
  });
  return new SuccessMessageResponse().send(res);
};

type RemoveReactionBody = {
  claimId: string;
  reactionId: string;
};

type RemoveReactionResponse = {
  ok: boolean;
  error?: string;
};

export const removeReaction = async (
  req: Request<any, any, RemoveReactionBody>,
  res: Response<RemoveReactionResponse>,
) => {
  const { claimId, reactionId } = req.body;
  const user = (req as any).user;

  const logger = parentLogger.child({
    // id: req.id,
    module: 'ATTESTATIONS::removeReaction',
    user: (req as any).user,
    body: req.body,
  });
  logger.trace(`removeReaction`);
  if (!claimId || !reactionId) throw new BadRequestError('ClaimId and reactionId are required');

  const reactionEntry = await attestationService.findReaction({ id: parseInt(reactionId) });
  if (!reactionEntry) throw new NotFoundError('Reaction not found'); // return res.status(404).send({ ok: false, error: 'Reaction not found' });
  if (reactionEntry.authorId !== user.id) throw new ForbiddenError();

  await attestationService.removeReaction(reactionEntry.id);
  return new SuccessMessageResponse().send(res);
};
