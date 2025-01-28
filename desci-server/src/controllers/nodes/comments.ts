import { ActionType, VoteType } from '@prisma/client';
import { Response, NextFunction } from 'express';
import z from 'zod';

import { prisma } from '../../client.js';
import { NotFoundError } from '../../core/ApiError.js';
import { SuccessMessageResponse, SuccessResponse } from '../../core/ApiResponse.js';
import { logger } from '../../logger.js';
import { RequestWithNode, RequestWithUser } from '../../middleware/authorisation.js';
import { editCommentsSchema, getCommentsSchema, postCommentVoteSchema } from '../../routes/v1/attestations/schema.js';
import { attestationService } from '../../services/Attestation.js';
import { saveInteraction } from '../../services/interactionLog.js';
import { asyncMap, ensureUuidEndsWithDot } from '../../utils.js';

const parentLogger = logger.child({ module: 'Comments' });
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
    const vote = await attestationService.getUserCommentVote(req.user.id, comment.id);
    return {
      ...comment,
      highlights: comment.highlights.map((h) => JSON.parse(h as string)),
      meta: {
        upvotes,
        downvotes,
        isUpvoted: vote?.type === VoteType.Yes,
        isDownVoted: vote?.type === VoteType.No,
      },
    };
  });

  const nextCursor = comments[comments.length - 1]?.id;
  return new SuccessResponse({ cursor: nextCursor, count, comments }).send(res);
};

export const editComment = async (req: RequestWithUser, res: Response) => {
  const { id } = req.body as z.infer<typeof editCommentsSchema>['params'];
  const { links, body } = req.body as z.infer<typeof editCommentsSchema>['body'];

  const user = req.user;

  const logger = parentLogger.child({
    commentId: req.params.id,
    module: 'Comments::Edit',
    user,
    body: req.body,
  });

  // if (uuid) {
  //   const node = await prisma.node.findFirst({ where: { uuid: ensureUuidEndsWithDot(uuid) } });
  //   if (!node) throw new NotFoundError('Node with uuid ${uuid} not found');
  // }
  logger.trace(`EditComment`);

  // let comment = await attestationService.getComment({ id });
  // if (!comment) throw new NotFoundError();

  // if (comment.authorId !== user.id) throw new ForbiddenError();
  const comment = await attestationService.editComment({ authorId: req.user.id, id, update: { body, links } });
  // if (highlights?.length > 0) {
  //   const processedHighlights = await asyncMap(highlights, async (highlight) => {
  //     if (!('image' in highlight)) return highlight;
  //     const blob = base64ToBlob(highlight.image);
  //     const storedCover = await client.add(blob, { cidVersion: 1 });

  //     return { ...highlight, image: `${PUBLIC_IPFS_PATH}/${storedCover.cid}` };
  //   });
  //   logger.info({ processedHighlights }, 'processedHighlights');
  //   annotation = await attestationService.createHighlight({
  //     claimId: claimId && parseInt(claimId.toString()),
  //     authorId: user.id,
  //     comment: body,
  //     links,
  //     highlights: processedHighlights as unknown as HighlightBlock[],
  //     visible,
  //     ...(uuid && { uuid: ensureUuidEndsWithDot(uuid) }),
  //   });
  //   await saveInteraction(req, ActionType.ADD_COMMENT, { annotationId: annotation.id, claimId, authorId });
  // } else {
  //   annotation = await attestationService.createComment({
  //     claimId: claimId && parseInt(claimId.toString()),
  //     authorId: user.id,
  //     comment: body,
  //     links,
  //     visible,
  //     ...(uuid && { uuid: ensureUuidEndsWithDot(uuid) }),
  //   });
  // }
  await saveInteraction(req, ActionType.EDIT_COMMENT, { commentId: comment.id });
  // await emitNotificationForAnnotation(annotation.id);
  new SuccessResponse(comment).send(res);
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
