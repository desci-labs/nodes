import { HighlightBlock } from '@desci-labs/desci-models';
import { Annotation } from '@prisma/client';
import { NextFunction, Request, Response } from 'express';
import _ from 'lodash';
import zod from 'zod';

import { PUBLIC_IPFS_PATH } from '../../config/index.js';
import {
  ForbiddenError,
  NotFoundError,
  SuccessMessageResponse,
  SuccessResponse,
  asyncMap,
  attestationService,
  createCommentSchema,
  logger as parentLogger,
} from '../../internal.js';
import { client } from '../../services/ipfs.js';
import { base64ToBlob } from '../../utils/upload.js';

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
    new SuccessMessageResponse().send(res);
  }
};

type AddCommentBody = zod.infer<typeof createCommentSchema>;

export const addComment = async (req: Request<any, any, AddCommentBody['body']>, res: Response<AddCommentResponse>) => {
  const { authorId, claimId, body, highlights, links } = req.body;
  const user = (req as any).user;

  if (parseInt(authorId.toString()) !== user.id) throw new ForbiddenError();

  const logger = parentLogger.child({
    // id: req.id,
    module: 'ATTESTATIONS::addCommentController',
    user: (req as any).user,
    body: req.body,
  });
  logger.trace(`addComment`);

  let annotation: Annotation;
  if (highlights?.length > 0) {
    const processedHighlights = await asyncMap(highlights, async (highlight) => {
      if (!highlight.image) return highlight;
      const blob = base64ToBlob(highlight.image);
      const storedCover = await client.add(blob, { cidVersion: 1 });
      logger.info(
        { storedCover, image: `${PUBLIC_IPFS_PATH}/${storedCover.cid}` },
        'Convert base64ToBlob and upload to ipfs',
      );
      return { ...highlight, image: `${PUBLIC_IPFS_PATH}/${storedCover.cid}` };
    });
    logger.info({ processedHighlights }, 'processedHighlights');
    annotation = await attestationService.createHighlight({
      claimId: parseInt(claimId.toString()),
      authorId: user.id,
      comment: body,
      links,
      highlights: processedHighlights as unknown as HighlightBlock[],
    });
  } else {
    annotation = await attestationService.createComment({
      claimId: parseInt(claimId.toString()),
      authorId: user.id,
      comment: body,
      links,
    });
  }

  new SuccessResponse({
    ...annotation,
    highlights: annotation.highlights.map((h) => JSON.parse(h as string)),
  }).send(res);
};
