import { Request, Response } from 'express';

import { prisma } from '../../client.js';
import { attestationService } from '../../internal.js';
import { logger as parentLogger } from '../../logger.js';

type AddCommentBody = {
  claimId: string;
  comment: string;
};

type AddCommentResponse = {
  ok: boolean;
  error?: string;
};

export const addComment = async (req: Request<any, any, AddCommentBody>, res: Response<AddCommentResponse>) => {
  const { claimId, comment } = req.body;
  const user = (req as any).user;

  const logger = parentLogger.child({
    // id: req.id,
    module: 'ATTESTATIONS::addCommentController',
    user: (req as any).user,
    body: req.body,
  });
  logger.trace(`addComment`);
  if (!claimId) return res.status(400).send({ ok: false, error: 'Claim ID is required' });
  if (!comment) return res.status(400).send({ ok: false, error: 'Comment is required' });

  try {
    const newComment = await attestationService.createComment({
      claimId: parseInt(claimId),
      authorId: user.id,
      comment: comment,
    });

    return res.status(200).send({ ok: true });
  } catch (e) {
    logger.error(e);
    return res.status(400).send({ ok: false, error: 'Failed to remove reaction' });
  }
};
