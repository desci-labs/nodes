import { HighlightBlock } from '@desci-labs/desci-models';
import { ActionType, Annotation, AnnotationType } from '@prisma/client';
import { NextFunction, Request, Response } from 'express';
import _ from 'lodash';
import zod from 'zod';

import { prisma } from '../../client.js';
import { PUBLIC_IPFS_PATH } from '../../config/index.js';
// import {
//   ForbiddenError,
//   NotFoundError,
//   SuccessMessageResponse,
//   SuccessResponse,
//   asyncMap,
//   attestationService,
//   createCommentSchema,
//   ensureUuidEndsWithDot,
//   logger as parentLogger,
//   prisma,
// } from '../../internal.js';
import { ForbiddenError, NotFoundError } from '../../core/ApiError.js';
import { SuccessMessageResponse, SuccessResponse } from '../../core/ApiResponse.js';
import { logger as parentLogger } from '../../logger.js';
import { createCommentSchema } from '../../routes/v1/attestations/schema.js';
import { attestationService } from '../../services/Attestation.js';
import { saveInteraction } from '../../services/interactionLog.js';
import { client } from '../../services/ipfs.js';
import { emitNotificationForAnnotation } from '../../services/NotificationService.js';
import { base64ToBlob } from '../../utils/upload.js';
import { asyncMap, ensureUuidEndsWithDot } from '../../utils.js';

export const getAttestationComments = async (req: Request, res: Response, next: NextFunction) => {
  const { claimId } = req.params;
  const claim = await attestationService.findClaimById(parseInt(claimId));
  if (!claim) throw new NotFoundError('Claim not found');

  const comments = await attestationService.getAllClaimComments({
    nodeAttestationId: claim.id,
    // type: AnnotationType.COMMENT,
  });

  const data = comments.map((comment) => {
    const author = _.pick(comment.author, ['id', 'name', 'orcid']);
    return { ...comment, author, highlights: comment.highlights.map((h) => JSON.parse(h as string)) };
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
    await saveInteraction(req, ActionType.REMOVE_COMMENT, {
      commentId,
      claimId: comment.nodeAttestationId,
      authorId: comment.authorId,
      userId: user.id,
    });
    new SuccessMessageResponse().send(res);
  }
};

type AddCommentBody = zod.infer<typeof createCommentSchema>;

export const addComment = async (req: Request<any, any, AddCommentBody['body']>, res: Response<AddCommentResponse>) => {
  const { authorId, claimId, body, highlights, links, uuid, visible } = req.body;
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
      claimId: claimId && parseInt(claimId.toString()),
      authorId: user.id,
      comment: body,
      links,
      highlights: processedHighlights as unknown as HighlightBlock[],
      visible,
      ...(uuid && { uuid: ensureUuidEndsWithDot(uuid) }),
    });
    await saveInteraction(req, ActionType.ADD_COMMENT, { annotationId: annotation.id, claimId, authorId });
  } else {
    annotation = await attestationService.createComment({
      claimId: claimId && parseInt(claimId.toString()),
      authorId: user.id,
      comment: body,
      links,
      visible,
      ...(uuid && { uuid: ensureUuidEndsWithDot(uuid) }),
    });
  }
  await saveInteraction(req, ActionType.ADD_COMMENT, { annotationId: annotation.id, claimId, authorId });
  await emitNotificationForAnnotation(annotation.id);
  new SuccessResponse({
    ...annotation,
    highlights: annotation.highlights.map((h) => JSON.parse(h as string)),
  }).send(res);
};
