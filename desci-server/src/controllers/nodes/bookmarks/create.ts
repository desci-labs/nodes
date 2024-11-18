import { User, BookmarkType } from '@prisma/client';
import { Request, Response } from 'express';
import { z } from 'zod';

import { prisma } from '../../../client.js';
import { logger as parentLogger } from '../../../logger.js';
import { ensureUuidEndsWithDot } from '../../../utils.js';

const CreateBookmarkSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal(BookmarkType.NODE),
    nodeUuid: z.string().min(1),
    shareKey: z.string().optional(),
  }),
  z.object({
    type: z.literal(BookmarkType.DOI),
    doi: z.string().min(1),
  }),
  z.object({
    type: z.literal(BookmarkType.OA),
    oaWorkId: z.string().min(1),
  }),
]);

type CreateBookmarkReqBody = z.infer<typeof CreateBookmarkSchema>;

export type CreateBookmarkRequest = Request<never, never, CreateBookmarkReqBody> & {
  user: User; // added by auth middleware
};

export type CreateBookmarkResBody =
  | {
      ok: true;
      message: string;
    }
  | {
      ok: false;
      error: string;
      details?: z.ZodIssue[] | string;
    };

export const createNodeBookmark = async (req: CreateBookmarkRequest, res: Response<CreateBookmarkResBody>) => {
  const user = req.user;

  if (!user) throw Error('Middleware not properly setup for CreateNodeBookmark controller, requires req.user');

  const bookmarkData = CreateBookmarkSchema.parse(req.body);
  // const { nodeUuid, shareKey, doi, oaWorkId } = CreateBookmarkSchema.parse(req.body);

  const logger = parentLogger.child({
    module: 'Bookmarks::CreateNodeBookmarkController',
    userId: user.id,
    body: req.body,
  });

  try {
    logger.trace({ type: bookmarkData.type }, 'Creating bookmark');

    const data = {
      userId: user.id,
      type: bookmarkData.type,
      nodeUuid: null,
      doi: null,
      oaWorkId: null,
      shareId: null,
    };

    switch (bookmarkData.type) {
      case BookmarkType.NODE:
        data.nodeUuid = ensureUuidEndsWithDot(bookmarkData.nodeUuid);
        data.shareId = bookmarkData.shareKey || null;
        break;
      case BookmarkType.DOI:
        data.doi = bookmarkData.doi;
        break;
      case BookmarkType.OA:
        data.oaWorkId = bookmarkData.oaWorkId;
        break;
    }

    const createdBookmark = await prisma.bookmarkedNode.create({ data });

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
