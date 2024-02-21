import { AnnotationType } from '@prisma/client';
import { NextFunction, Request, Response } from 'express';
import _ from 'lodash';
// import zod from 'zod';

import {
  ForbiddenError,
  NotFoundError,
  SuccessResponse,
  attestationService,
  logger as parentLogger,
  prisma,
} from '../../internal.js';
// import { createCommentSchema } from '../../routes/v1/attestations/schema.js';

export const getAttestationComments = async (req: Request, res: Response, next: NextFunction) => {
  const { claimId } = req.params;
  const claim = await attestationService.findClaimById(parseInt(claimId));
  if (!claim) throw new NotFoundError('Claim not found');

  const comments = await attestationService.getAllClaimComments({
    nodeAttestationId: claim.id,
    type: AnnotationType.COMMENT,
  });

  const data = comments
    // .filter((comment) => comment.attestation.attestationVersionId === parseInt(attestationVersionId))
    .map((comment) => {
      const author = _.pick(comment.author, ['id', 'name', 'orcid']);
      return { ...comment, author };
    });

  return new SuccessResponse(data).send(res);
};

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

type AddCommentBody = {
  authorId: string;
  claimId: string;
  body: string;
};

export const addComment = async (req: Request<any, any, AddCommentBody>, res: Response<AddCommentResponse>) => {
  const { authorId, claimId, body } = req.body;
  const user = (req as any).user;

  if (parseInt(authorId) !== user.id) throw new ForbiddenError();

  const logger = parentLogger.child({
    // id: req.id,
    module: 'ATTESTATIONS::addCommentController',
    user: (req as any).user,
    body: req.body,
  });
  logger.trace(`addComment`);

  const annotation = await attestationService.createComment({
    claimId: parseInt(claimId),
    authorId: user.id,
    comment: body,
  });

  new SuccessResponse(annotation).send(res);
};
