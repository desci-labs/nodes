import { Response } from 'express';
import { NextFunction } from 'http-proxy-middleware/dist/types.js';
import { z } from 'zod';

import { prisma } from '../../client.js';
import { SuccessMessageResponse, SuccessResponse } from '../../core/ApiResponse.js';
import { RequestWithNode } from '../../middleware/authorisation.js';
import { countLikesByUuid, getUserNodeLike, likeNode, unlikeNode } from '../../services/node.js';
import { ensureUuidEndsWithDot } from '../../utils.js';

export const likeNodeSchema = z.object({
  params: z.object({
    // quickly disqualify false uuid strings
    uuid: z.string(),
  }),
});

export const unlikeNodeSchema = z.object({
  params: z.object({
    // quickly disqualify false uuid strings
    uuid: z.string(),
    // // quickly disqualify false uuid strings
    // likeId: z.coerce.number(),
  }),
});

export const postNodeLike = async (req: RequestWithNode, res: Response, _next: NextFunction) => {
  await likeNode({ userId: req.user.id, nodeUuid: ensureUuidEndsWithDot(req.node.uuid) });
  return new SuccessMessageResponse().send(res);
};

export const deleteNodeLIke = async (req: RequestWithNode, res: Response, _next: NextFunction) => {
  const like = await getUserNodeLike(req.user.id, req.node.uuid);
  if (!like) return new SuccessMessageResponse().send(res);

  await unlikeNode(like.id);
  return new SuccessMessageResponse().send(res);
};

export const getNodeLikes = async (req: RequestWithNode, res: Response, _next: NextFunction) => {
  const likes = await countLikesByUuid(req.node.uuid);
  const like = req?.user?.id ? await getUserNodeLike(req.user.id, req.node.uuid) : false;

  return new SuccessResponse({ likes, isLiked: !!like }).send(res);
};
