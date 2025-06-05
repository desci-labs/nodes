import { HighlightBlock } from '@desci-labs/desci-models';
import { ActionType, Annotation, AnnotationType, CommentVote, VoteType } from '@prisma/client';
import { NextFunction, Request, Response } from 'express';
import _ from 'lodash';
import zod from 'zod';

import { prisma } from '../../client.js';
import { PUBLIC_IPFS_PATH } from '../../config/index.js';
import { ForbiddenError, NotFoundError } from '../../core/ApiError.js';
import { SuccessMessageResponse, SuccessResponse } from '../../core/ApiResponse.js';
import { logger as parentLogger } from '../../logger.js';
import { RequestWithUser } from '../../middleware/authorisation.js';
import { createCommentSchema, getAttestationCommentsSchema } from '../../routes/v1/attestations/schema.js';
import { attestationService } from '../../services/Attestation.js';
import { saveInteraction } from '../../services/interactionLog.js';
import { client } from '../../services/ipfs.js';
import { NotificationService } from '../../services/Notifications/NotificationService.js';
import { base64ToBlob } from '../../utils/upload.js';
import { asyncMap, ensureUuidEndsWithDot } from '../../utils.js';

export const getAttestationComments = async (req: RequestWithUser, res: Response, next: NextFunction) => {
  const { claimId } = req.params;
  const { cursor, limit, replyTo } = req.query as zod.infer<typeof getAttestationCommentsSchema>['query'];
  const claim = await attestationService.findClaimById(parseInt(claimId));
  if (!claim) throw new NotFoundError('Claim not found');

  const count = await attestationService.countComments({
    nodeAttestationId: claim.id,
  });
  const comments = await attestationService.getAllClaimComments(
    {
      nodeAttestationId: claim.id,
      ...(replyTo ? { replyToId: { equals: replyTo } } : { replyToId: null }),
    },
    { cursor: cursor ? parseInt(cursor.toString()) : undefined, limit: parseInt(limit.toString()) },
  );

  const data = await asyncMap(comments, async (comment) => {
    let upvotes: number, downvotes: number, vote: CommentVote;
    if (req?.user?.id) {
      upvotes = await attestationService.getCommentUpvotes(comment.id);
      downvotes = await attestationService.getCommentDownvotes(comment.id);
      vote = await attestationService.getUserCommentVote(req.user.id, comment.id);
    }
    return {
      ...comment,
      highlights: comment.highlights.map((h) => JSON.parse(h as string)),
      ...(req?.user?.id && {
        meta: {
          upvotes,
          downvotes,
          replyCount: comment._count.replies,
          isUpvoted: vote?.type === VoteType.Yes,
          isDownVoted: vote?.type === VoteType.No,
        },
      }),
    };
  });

  const nextCursor = data[data.length - 1]?.id;
  return new SuccessResponse({ cursor: nextCursor, count, comments: data }).send(res);
};

type RemoveCommentBody = {
  commentId: string;
};

type AddCommentResponse = {
  ok: boolean;
  error?: string;
};

export const removeComment = async (req: Request<RemoveCommentBody, any, any>, res: Response<AddCommentResponse>) => {
  const { commentId } = req.params;
  const user = (req as any).user;

  const logger = parentLogger.child({
    // id: req.id,
    module: 'ATTESTATIONS::removeCommentController',
    user: (req as any).user,
    body: req.body,
  });
  logger.trace(`removeComment`);

  const comment = await attestationService.findAnnotationById(parseInt(commentId)); //await prisma.annotation.findUnique({ where: { id: parseInt(commentId) } });

  if (!comment) {
    new SuccessMessageResponse().send(res);
  } else {
    if (comment.authorId !== user.id) throw new ForbiddenError();
    await attestationService.removeComment(parseInt(commentId));
    await saveInteraction({
      req,
      action: ActionType.REMOVE_COMMENT,
      data: { commentId, claimId: comment.nodeAttestationId, authorId: comment.authorId, userId: user.id },
    });
    new SuccessMessageResponse().send(res);
  }
};

type AddCommentBody = zod.infer<typeof createCommentSchema>;

export const postComment = async (
  req: Request<any, any, AddCommentBody['body']>,
  res: Response<AddCommentResponse>,
) => {
  const { authorId, claimId, body, highlights, links, uuid, visible, replyTo } = req.body;
  const user = (req as any).user;

  if (parseInt(authorId.toString()) !== user.id) throw new ForbiddenError();

  const logger = parentLogger.child({
    // id: req.id,
    module: 'ATTESTATIONS::addCommentController',
    user: (req as any).user,
    body: req.body,
  });

  if (uuid) {
    const node = await prisma.node.findFirst({ where: { uuid: ensureUuidEndsWithDot(uuid) } });
    if (!node) throw new NotFoundError('Node with uuid ${uuid} not found');
  }
  logger.trace(`addComment`);

  let annotation: Annotation;
  if (highlights?.length > 0) {
    const processedHighlights = await asyncMap(highlights, async (highlight) => {
      if (!('image' in highlight)) return highlight;
      const blob = base64ToBlob(highlight.image);
      const storedCover = await client.add(blob, { cidVersion: 1 });

      return { ...highlight, image: `${PUBLIC_IPFS_PATH}/${storedCover.cid}` };
    });
    logger.info({ processedHighlights }, 'processedHighlights');
    annotation = await attestationService.createHighlight({
      links,
      visible,
      replyTo,
      comment: body,
      authorId: user.id,
      claimId: claimId && parseInt(claimId.toString()),
      highlights: processedHighlights as unknown as HighlightBlock[],
      ...(uuid && { uuid: ensureUuidEndsWithDot(uuid) }),
    });
    await saveInteraction({
      req,
      action: ActionType.ADD_COMMENT,
      data: { annotationId: annotation.id, claimId, authorId },
    });
  } else {
    annotation = await attestationService.createComment({
      claimId: claimId && parseInt(claimId.toString()),
      authorId: user.id,
      comment: body,
      links,
      visible,
      replyTo,
      ...(uuid && { uuid: ensureUuidEndsWithDot(uuid) }),
    });
  }
  await saveInteraction({
    req,
    action: ActionType.ADD_COMMENT,
    data: { annotationId: annotation.id, claimId, authorId },
  });
  await NotificationService.emitOnAnnotation(annotation.id);
  new SuccessResponse({
    ...annotation,
    highlights: annotation.highlights.map((h) => JSON.parse(h as string)),
  }).send(res);
};
