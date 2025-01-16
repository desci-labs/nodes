import { VoteType } from '@prisma/client';
import { Response, NextFunction } from 'express';
import _ from 'lodash';
import z from 'zod';

import { prisma } from '../../client.js';
import { ForbiddenError, NotFoundError } from '../../core/ApiError.js';
import { SuccessMessageResponse, SuccessResponse } from '../../core/ApiResponse.js';
import { logger } from '../../logger.js';
import { RequestWithNode, RequestWithUser } from '../../middleware/authorisation.js';
import { getCommentsSchema, postCommentVoteSchema } from '../../routes/v1/attestations/schema.js';
import { attestationService } from '../../services/Attestation.js';
import { asyncMap, ensureUuidEndsWithDot } from '../../utils.js';

export const getGeneralComments = async (req: RequestWithNode, res: Response, _next: NextFunction) => {
  const { uuid } = req.params as z.infer<typeof getCommentsSchema>['params'];
  const node = await prisma.node.findFirst({ where: { uuid: ensureUuidEndsWithDot(uuid) } });
  if (!node) throw new NotFoundError("Can't comment on unknown research object");

  const restrictVisibility = node.ownerId !== req?.user?.id;

  // console.log({ restrictVisibility, uuid }, 'Query Comments');
  const comments = await attestationService.getComments({
    uuid: ensureUuidEndsWithDot(uuid),
    ...(restrictVisibility && { visible: true }),
  });
  // console.log('getGeneralComments', { comments });
  const data = await asyncMap(comments, async (comment) => {
    const upvotes = await attestationService.getCommentUpvotes(comment.id);
    const downvotes = await attestationService.getCommentDownvotes(comment.id);
    return {
      ...comment,
      upvotes,
      downvotes,
      highlights: comment.highlights.map((h) => JSON.parse(h as string)),
    };
  });
  console.log('data', { data });
  return new SuccessResponse(data).send(res);
};

export const upvoteComment = async (req: RequestWithUser, res: Response, _next: NextFunction) => {
  const { uuid, commentId } = req.params as z.infer<typeof postCommentVoteSchema>['params'];
  const node = await prisma.node.findFirst({ where: { uuid: ensureUuidEndsWithDot(uuid) } });
  if (!node) throw new NotFoundError("Can't vote on unknown research object");

  const userId = req.user.id;
  await attestationService.upvoteComment({ userId, annotationId: parseInt(commentId.toString()), type: VoteType.Yes });

  return new SuccessMessageResponse().send(res);
};

export const downvoteComment = async (req: RequestWithUser, res: Response, _next: NextFunction) => {
  const { uuid, commentId } = req.params as z.infer<typeof postCommentVoteSchema>['params'];
  const node = await prisma.node.findFirst({ where: { uuid: ensureUuidEndsWithDot(uuid) } });
  if (!node) throw new NotFoundError("Can't vote on unknown research object");

  const userId = req.user.id;
  await attestationService.downvoteComment({ userId, annotationId: parseInt(commentId.toString()), type: VoteType.No });

  return new SuccessMessageResponse().send(res);
};

export const getUserVote = async (req: RequestWithUser, res: Response, _next: NextFunction) => {
  const { uuid, commentId } = req.params as z.infer<typeof postCommentVoteSchema>['params'];
  const node = await prisma.node.findFirst({ where: { uuid: ensureUuidEndsWithDot(uuid) } });
  if (!node) throw new NotFoundError("Can't vote on unknown research object");

  const userId = req.user.id;
  const vote = await attestationService.getUserCommentVote(userId, parseInt(commentId.toString()));

  return new SuccessResponse(vote).send(res);
};

export const deleteUserVote = async (req: RequestWithUser, res: Response, _next: NextFunction) => {
  const { uuid, commentId } = req.params as z.infer<typeof postCommentVoteSchema>['params'];
  const node = await prisma.node.findFirst({ where: { uuid: ensureUuidEndsWithDot(uuid) } });
  if (!node) throw new NotFoundError("Can't vote on unknown research object");

  const userId = req.user.id;
  const vote = await attestationService.getUserCommentVote(userId, parseInt(commentId.toString()));

  if (vote) {
    await attestationService.deleteCommentVote(vote.id);
  }

  return new SuccessMessageResponse().send(res);
};
