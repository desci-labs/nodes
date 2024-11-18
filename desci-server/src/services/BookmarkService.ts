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

type DeleteBookmarkParams =
  | { type: 'NODE'; nodeUuid: string }
  | { type: 'DOI'; doi: string }
  | { type: 'OA'; oaWorkId: string };

export const deleteBookmark = async (userId: number, params: DeleteBookmarkParams): Promise<BookmarkedNode> => {
  logger.info({ userId, ...params }, 'Deleting bookmark');

  const bookmark = await prisma.bookmarkedNode.findFirst({
    where: {
      userId,
      type: params.type,
      ...(() => {
        switch (params.type) {
          case 'NODE':
            return { nodeUuid: ensureUuidEndsWithDot(params.nodeUuid) };
          case 'DOI':
            return { doi: params.doi };
          case 'OA':
            return { oaWorkId: params.oaWorkId };
        }
      })(),
    },
    select: {
      id: true,
    },
  });

  if (!bookmark) {
    logger.warn({}, 'Bookmark not found');
    throw new Error('Bookmark not found');
  }

  const deletedBookmark = await prisma.bookmarkedNode.delete({
    where: { id: bookmark.id },
  });

  logger.info({ bookmarkId: deletedBookmark.id }, 'Bookmark deleted successfully');
  return deletedBookmark;
};

export const BookmarkService = {
  createBookmark,
  deleteBookmark,
};
