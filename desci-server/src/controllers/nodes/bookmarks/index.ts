import { BookmarkType, User } from '@prisma/client';
import { Request, Response } from 'express';
import { z } from 'zod';

import { logger as parentLogger } from '../../../logger.js';
import { BookmarkService, FilledBookmark } from '../../../services/BookmarkService.js';
import { PaginatedResponse } from '../../notifications/index.js';

export const GetBookmarksQuerySchema = z.object({
  page: z.string().regex(/^\d+$/).transform(Number).optional().default('1'),
  perPage: z.string().regex(/^\d+$/).transform(Number).optional(),
  type: z.enum([BookmarkType.NODE, BookmarkType.DOI, BookmarkType.OA]).optional(),
});

export type ListBookmarksRequest = Request & {
  user: User;
  query: z.infer<typeof GetBookmarksQuerySchema>;
};
export type ListBookmarksResBody =
  | PaginatedResponse<FilledBookmark>
  | {
      error: string;
      details?: z.ZodIssue[] | string;
    };

export const listBookmarkedNodes = async (req: ListBookmarksRequest, res: Response<ListBookmarksResBody>) => {
  const user = req.user;
  if (!user) throw Error('Middleware not properly setup for ListBookmarkedNodes controller, requires req.user');

  const logger = parentLogger.child({
    module: 'Bookmarks::ListBookmarksController',
    query: req.query,
    userId: user.id,
  });

  try {
    logger.trace({}, 'Retrieving bookmarked nodes for user');
    const query = GetBookmarksQuerySchema.parse(req.query);
    const bookmarks = await BookmarkService.getBookmarks(user.id, query);

    logger.info(
      {
        totalItems: bookmarks.pagination.totalItems,
        page: bookmarks.pagination.currentPage,
        totalPages: bookmarks.pagination.totalPages,
      },
      'Successfully fetched bookmarks',
    );

    return res.status(200).json(bookmarks);
  } catch (e) {
    if (e instanceof z.ZodError) {
      logger.warn({ error: e.errors }, 'Invalid request parameters');
      return res.status(400).json({ error: 'Invalid request parameters', details: e.errors });
    }
    logger.error({ e }, 'Error fetching bookmarks');
    return res.status(500).json({ error: 'Internal server error' });
  }
};
