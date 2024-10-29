import type { Request, Response, NextFunction } from 'express';

import { prisma } from '../../client.js';
import { logger as parentLogger } from '../../logger.js';
import { type ThumbnailMap, thumbnailsService } from '../../services/Thumbnails.js';
import { NodeUuid } from '../../types/nodes.js';
import { ensureUuidEndsWithDot } from '../../utils.js';

type ThumbnailsReqBodyParams = {
  uuid: string;
  manifestCid?: string;
};

type ThumbnailsResponse = {
  ok: true;
  thumbnailMap: ThumbnailMap;
};

type ThumbnailsErrorResponse = {
  ok: false;
  error: string;
  status?: number;
};

/**
 * Generates and retrieves preview thumbnails of pinned components for a node.
 * @param req.params.uuid required for both drafts and published nodes
 * @param req.params.manifestCid only required for published nodes (to get a specific version), without the latest draft will be used.
 * @return {ThumbnailMap} ThumbnailMap = Record<ComponentCidString, Record<HeightPx, ThumbnailCidString>>
 */
export const thumbnails = async (
  req: Request<any, any, ThumbnailsReqBodyParams>,
  res: Response<ThumbnailsResponse | ThumbnailsErrorResponse>,
) => {
  const user = (req as any).user;
  const { uuid, manifestCid } = req.params;
  // debugger;
  const logger = parentLogger.child({
    module: 'NODES::Thumbnails',
    uuid,
    manifestCid,
    userId: user?.id,
  });
  logger.trace({ fn: 'Retrieving thumbnails' });

  if (!uuid) return res.status(400).json({ ok: false, error: 'UUID is required.' });

  if (!user && !manifestCid) {
    // If there's no manifestCid passed in, we're looking at a draft node, and it requires auth.
    return res.status(401).json({ ok: false, error: 'Unauthorized' });
  }

  if (user && !manifestCid) {
    // Check if user owns node, if requesting draft thumbnails
    const node = await prisma.node.findFirst({
      where: {
        ownerId: user.id,
        uuid: ensureUuidEndsWithDot(uuid),
      },
    });

    if (!node) return res.status(401).json({ ok: false, error: 'Unauthorized' });
  }
  // debugger;
  const thumbnailMap = await thumbnailsService.getThumbnailsForNode({ uuid: uuid as NodeUuid, manifestCid });

  return res.status(200).json({ ok: true, thumbnailMap });
};
