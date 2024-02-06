import { Request, Response } from 'express';

import { prisma } from '../../client.js';
import { attestationService } from '../../internal.js';
import { logger as parentLogger } from '../../logger.js';

type RemoveReactionBody = {
  claimId: string;
  reaction: string;
};

type RemoveReactionResponse = {
  ok: boolean;
  error?: string;
};

export const removeReaction = async (
  req: Request<any, any, RemoveReactionBody>,
  res: Response<RemoveReactionResponse>,
) => {
  const { claimId, reaction } = req.body;
  const user = (req as any).user;

  const logger = parentLogger.child({
    // id: req.id,
    module: 'ATTESTATIONS::removeReaction',
    user: (req as any).user,
    body: req.body,
  });
  logger.trace(`removeReaction`);
  if (!claimId) return res.status(400).send({ ok: false, error: 'Claim ID is required' });
  if (!reaction) return res.status(400).send({ ok: false, error: 'Reaction is required' });

  try {
    const reactionEntry = await prisma.nodeAttestationReaction.findFirst({
      where: { authorId: user.id, nodeAttestationId: parseInt(claimId), reaction },
    });
    if (!reactionEntry) return res.status(404).send({ ok: false, error: 'Reaction not found' });
    const removed = await attestationService.removeReaction(reactionEntry.id);

    return res.status(200).send({ ok: true });
  } catch (e) {
    logger.error(e);
    return res.status(400).send({ ok: false, error: 'Failed to remove reaction' });
  }
};
