import { User } from '@prisma/client';
import { Request, Response } from 'express';
import { z } from 'zod';

import { prisma } from '../../../client.js';
import { logger as parentLogger } from '../../../logger.js';
import { ensureUuidEndsWithDot } from '../../../utils.js';

const CreateBookmarkSchema = z.object({
  nodeUuid: z.string().min(1),
  shareKey: z.string().optional(),
});

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
      details?: z.ZodIssue[] | string;
    };

export const createNodeBookmark = async (req: CreateNodeBookmarkRequest, res: Response<CreateNodeBookmarkResBody>) => {
  const user = req.user;

  if (!user) throw Error('Middleware not properly setup for CreateNodeBookmark controller, requires req.user');

  const { nodeUuid, shareKey } = CreateBookmarkSchema.parse(req.body);

  const logger = parentLogger.child({
    module: 'Bookmarks::CreateNodeBookmarkController',
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
    return res.status(201).json({ ok: true, message: 'Bookmark created successfully' });
  } catch (e) {
    if (e instanceof z.ZodError) {
      logger.warn({ error: e.errors }, 'Invalid request parameters');
      return res.status(400).json({ ok: false, error: 'Invalid request parameters', details: e.errors });
    }

    logger.error({ e }, 'Error creating bookmark');
    return res.status(500).json({ ok: false, error: 'Internal server error' });
  }
};
