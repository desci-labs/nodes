import { User } from '@prisma/client';
import { Request, Response } from 'express';

import { prisma } from '../../../client.js';
// import { ensureUuidEndsWithDot } from '../../../internal.js';
import { logger as parentLogger } from '../../../logger.js';
import { ensureUuidEndsWithDot } from '../../../utils.js';

export type DeleteNodeBookmarkRequest = Request<{ nodeUuid: string }, never> & {
  user: User; // added by auth middleware
};

export type DeleteNodeBookmarkResBody =
  | {
      ok: true;
      message: string;
    }
  | {
      ok: false;
      error: string;
    };

export const deleteNodeBookmark = async (req: DeleteNodeBookmarkRequest, res: Response<DeleteNodeBookmarkResBody>) => {
  const user = req.user;

  if (!user) throw Error('Middleware not properly setup for DeleteNodeBookmark controller, requires req.user');

  const { nodeUuid } = req.params;
  if (!nodeUuid) return res.status(400).json({ ok: false, error: 'nodeUuid is required' });

  const logger = parentLogger.child({
    module: 'PrivateShare::DeleteNodeBookmarkController',
    body: req.body,
    userId: user.id,
    nodeUuid: nodeUuid,
  });

  try {
    logger.trace({}, 'Bookmarking node');
    const bookmark = await prisma.bookmarkedNode.findFirst({
      where: { nodeUuid: ensureUuidEndsWithDot(nodeUuid), userId: user.id },
    });

    if (!bookmark) {
      logger.warn({}, 'Bookmark not found for node');
      return res.status(404).json({ ok: false, error: 'Bookmark not found' });
    }

    const deleteResult = await prisma.bookmarkedNode.delete({
      where: {
        id: bookmark.id,
      },
    });

    logger.trace({ deleteResult }, 'Bookmark deleted successfully');
    return res.status(200).json({ ok: true, message: 'Bookmark deleted successfully' });
  } catch (e) {
    logger.error({ e, message: e?.message }, 'Failed to delete bookmark');
    return res.status(500).json({ ok: false, error: 'Failed to delete bookmark for node' });
  }
};
