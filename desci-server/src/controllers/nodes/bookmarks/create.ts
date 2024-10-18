import { User } from '@prisma/client';
import { Request, Response } from 'express';

import { prisma } from '../../../client.js';
import { logger as parentLogger } from '../../../logger.js';
import { ensureUuidEndsWithDot } from '../../../utils.js';

export type CreateNodeBookmarkReqBody = {
  nodeUuid: string;
  shareKey?: string;
};

export type CreateNodeBookmarkRequest = Request<never, never, CreateNodeBookmarkReqBody> & {
  user: User; // added by auth middleware
};

export type CreateNodeBookmarkResBody =
  | {
      ok: true;
      message: string;
    }
  | {
      ok: false;
      error: string;
    };

export const createNodeBookmark = async (req: CreateNodeBookmarkRequest, res: Response<CreateNodeBookmarkResBody>) => {
  const user = req.user;

  if (!user) throw Error('Middleware not properly setup for CreateNodeBookmark controller, requires req.user');

  const { nodeUuid, shareKey } = req.body;
  if (!nodeUuid) return res.status(400).json({ ok: false, error: 'nodeUuid is required' });

  const logger = parentLogger.child({
    module: 'PrivateShare::CreateNodeBookmarkController',
    body: req.body,
    userId: user.id,
    nodeUuid: nodeUuid,
    shareId: shareKey,
  });

  try {
    logger.trace({}, 'Bookmarking node');
    const createdBookmark = await prisma.bookmarkedNode.create({
      data: {
        userId: user.id,
        nodeUuid: ensureUuidEndsWithDot(nodeUuid),
        shareId: shareKey || null,
      },
    });

    logger.trace({ createdBookmark }, 'Bookmark created successfully');
    return res.status(200).json({ ok: true, message: 'Bookmark created successfully' });
  } catch (e) {
    logger.error({ e, message: e?.message }, 'Failed to create bookmark');
    return res.status(500).json({ ok: false, error: 'Failed to create bookmark for node' });
  }
};
