import { BookmarkType, BookmarkedNode, Prisma } from '@prisma/client';
import { z } from 'zod';

import { prisma } from '../client.js';
import { CreateBookmarkSchema } from '../controllers/nodes/bookmarks/create.js';
import { logger as parentLogger } from '../logger.js';
import { ensureUuidEndsWithDot } from '../utils.js';

const logger = parentLogger.child({
  module: 'Bookmarks::BookmarkService',
});

type CreateBookmarkData = {
  userId: number;
} & z.infer<typeof CreateBookmarkSchema>;

export const createBookmark = async (data: CreateBookmarkData): Promise<BookmarkedNode> => {
  logger.info({ data }, 'Creating bookmark');

  const prismaData = {
    userId: data.userId,
    type: data.type,
  };

  const extraData = (() => {
    switch (data.type) {
      case BookmarkType.NODE:
        return {
          nodeUuid: ensureUuidEndsWithDot(data.nodeUuid),
          shareId: data.shareKey || null,
        };
      case BookmarkType.DOI:
        return { doi: data.doi };
      case BookmarkType.OA:
        return { oaWorkId: data.oaWorkId };
    }
  })();

  const bookmark = await prisma.bookmarkedNode.create({
    data: { ...prismaData, ...extraData },
  });

  logger.info({ bookmarkId: bookmark.id }, 'Bookmark created successfully');
  return bookmark;
};

export const BookmarkService = {
  createBookmark,
};
