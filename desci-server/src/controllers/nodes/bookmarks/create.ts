import { User, BookmarkType } from '@prisma/client';
import { Request, Response } from 'express';
import { z } from 'zod';

import { logger as parentLogger } from '../../../logger.js';
import { BookmarkService } from '../../../services/BookmarkService.js';
export const CreateBookmarkSchema = z.discriminatedUnion('type', [
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

  const logger = parentLogger.child({
    module: 'Bookmarks::CreateNodeBookmarkController',
    userId: user.id,
    body: req.body,
  });

  try {
    const bookmarkData = CreateBookmarkSchema.parse(req.body);

    logger.trace({ type: bookmarkData.type }, 'Creating bookmark');

    await BookmarkService.createBookmark({
      userId: user.id,
      ...bookmarkData,
    });

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
