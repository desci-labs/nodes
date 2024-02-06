import { Attestation, NodeAttestation } from '@prisma/client';
import { Request, Response } from 'express';

import { attestationService } from '../../internal.js';
import { logger as parentLogger } from '../../logger.js';

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
  const { claimId, reaction } = req.body;
  const user = (req as any).user;

  const logger = parentLogger.child({
    // id: req.id,
    module: 'ATTESTATIONS::addReaction',
    user: (req as any).user,
    body: req.body,
  });
  logger.trace(`addReaction`);
  if (!claimId) return res.status(400).send({ ok: false, error: 'Claim ID is required' });
  if (!reaction) return res.status(400).send({ ok: false, error: 'Reaction is required' });

  try {
    const newReaction = await attestationService.createReaction({
      claimId: parseInt(claimId),
      userId: user.id,
      reaction,
    });

    return res.status(200).send({ ok: true });
  } catch (e) {
    logger.error(e);
    return res.status(400).send({ ok: false, error: 'Failed to add reaction' });
  }
};
