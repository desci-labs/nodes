import { VoteType } from '@prisma/client';
import { Response, NextFunction } from 'express';
import z from 'zod';

import { prisma } from '../../client.js';
import { NotFoundError } from '../../core/ApiError.js';
import { SuccessMessageResponse, SuccessResponse } from '../../core/ApiResponse.js';
import { RequestWithNode, RequestWithUser } from '../../middleware/authorisation.js';
import { getCommentsSchema, postCommentVoteSchema } from '../../routes/v1/attestations/schema.js';
import { attestationService } from '../../services/Attestation.js';
import { asyncMap, ensureUuidEndsWithDot } from '../../utils.js';

export const getGeneralComments = async (req: RequestWithNode, res: Response, _next: NextFunction) => {
  const { uuid } = req.params as z.infer<typeof getCommentsSchema>['params'];
  const { cursor, limit } = req.query as z.infer<typeof getCommentsSchema>['query'];
  const node = await prisma.node.findFirst({ where: { uuid: ensureUuidEndsWithDot(uuid) } });
  if (!node) throw new NotFoundError("Can't comment on unknown research object");

  const restrictVisibility = node.ownerId !== req?.user?.id;

  const count = await attestationService.countComments({
    uuid: ensureUuidEndsWithDot(uuid),
    ...(restrictVisibility && { visible: true }),
  });

  const data = await attestationService.getComments(
    {
      uuid: ensureUuidEndsWithDot(uuid),
      ...(restrictVisibility && { visible: true }),
    },
    { cursor: cursor ? parseInt(cursor.toString()) : undefined, limit: limit ? parseInt(limit.toString()) : undefined },
  );

  const comments = await asyncMap(data, async (comment) => {
    const upvotes = await attestationService.getCommentUpvotes(comment.id);
    const downvotes = await attestationService.getCommentDownvotes(comment.id);
    return {
      ...comment,
      upvotes,
      downvotes,
      highlights: comment.highlights.map((h) => JSON.parse(h as string)),
    };
  });

  const nextCursor = comments[comments.length - 1]?.id;
  return new SuccessResponse({ cursor: nextCursor, count, comments }).send(res);
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
