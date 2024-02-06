import { Request, Response } from 'express';

import { prisma } from '../../client.js';
import { attestationService } from '../../internal.js';
import { logger as parentLogger } from '../../logger.js';

type RemoveCommentBody = {
  commentId: string;
};

type AddCommentResponse = {
  ok: boolean;
  error?: string;
};

export const removeComment = async (req: Request<any, any, RemoveCommentBody>, res: Response<AddCommentResponse>) => {
  const { commentId } = req.body;
  const user = (req as any).user;

  const logger = parentLogger.child({
    // id: req.id,
    module: 'ATTESTATIONS::removeCommentController',
    user: (req as any).user,
    body: req.body,
  });
  logger.trace(`removeComment`);
  if (!commentId) return res.status(400).send({ ok: false, error: 'Comment ID is required' });

  try {
    const comment = await prisma.annotation.findUnique({ where: { id: parseInt(commentId) } });
    if (!comment) return res.status(404).send({ ok: false, error: 'Comment not found' });
    if (comment.authorId !== user.id)
      return res.status(401).send({ ok: false, error: 'Only the owner of the comment can remove it' });

    const removedComment = await attestationService.removeComment(parseInt(commentId));

    return res.status(200).send({ ok: true });
  } catch (e) {
    logger.error(e);
    return res.status(400).send({ ok: false, error: 'Failed to remove reaction' });
  }
};
