import { BookmarkType, BookmarkedNode, Node, Prisma } from '@prisma/client';
import { z } from 'zod';

import { prisma } from '../client.js';
import { CreateBookmarkSchema } from '../controllers/nodes/bookmarks/create.js';
import { GetBookmarksQuerySchema } from '../controllers/nodes/bookmarks/index.js';
import { PaginatedResponse } from '../controllers/notifications/index.js';
import { logger as parentLogger } from '../logger.js';
import { ensureUuidEndsWithDot } from '../utils.js';

import { getLatestManifestFromNode } from './manifestRepo.js';
import { getDpidFromNode } from './node.js';
import { OpenAlexService } from './OpenAlexService.js';

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
      case BookmarkType.DOI: {
        return OpenAlexService.getMetadataByDoi(data.doi)
          .then((metadata) => ({ title: metadata.title, doi: data.doi }))
          .catch((e) => ({ doi: data.doi, title: data.doi }));
      }
      case BookmarkType.OA:
        return OpenAlexService.getMetadataByWorkId(data.oaWorkId)
          .then((metadata) => ({ title: metadata.title, oaWorkId: data.oaWorkId }))
          .catch((e) => ({ oaWorkId: data.oaWorkId, title: data.oaWorkId }));
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

type GetBookmarksQuery = z.infer<typeof GetBookmarksQuerySchema>;

export interface FilledBookmark {
  id: number;
  type: BookmarkType;
  nodeUuid?: string;
  doi?: string;
  oaWorkId?: string;
  title?: string;
  published?: boolean;
  dpid?: number | string;
  shareKey?: string;
}

export const getBookmarks = async (
  userId: number,
  query: GetBookmarksQuery,
): Promise<PaginatedResponse<FilledBookmark>> => {
  const { page, perPage, type } = query;
  const skip = (page - 1) * perPage;

  const whereClause = {
    userId,
    ...(type && { type }),
  };

  const [bookmarks, totalItems] = await Promise.all([
    prisma.bookmarkedNode.findMany({
      where: whereClause,
      skip,
      take: perPage,
      orderBy: { createdAt: 'desc' },
      include: {
        node: {
          select: {
            uuid: true,
            dpidAlias: true,
            manifestUrl: true,
            manifestDocumentId: true,
            // Get published versions, if any
            versions: {
              where: {
                OR: [{ transactionId: { not: null } }, { commitId: { not: null } }],
              },
            },
          },
        },
      },
    }),
    prisma.bookmarkedNode.count({ where: whereClause }),
  ]);

  const filledBookmarks = await Promise.all(
    bookmarks.map(async (bookmark) => {
      const details: FilledBookmark = {
        id: bookmark.id,
        type: bookmark.type,
      };

      switch (bookmark.type) {
        case BookmarkType.NODE:
          if (bookmark.node) {
            const latestManifest = await getLatestManifestFromNode(bookmark.node);
            const dpid = await getDpidFromNode(bookmark.node as unknown as Node, latestManifest);
            details.nodeUuid = bookmark.nodeUuid;
            details.title = latestManifest.title;
            details.dpid = dpid;
            details.published = bookmark.node.versions.length > 0;
            details.shareKey = bookmark.shareId;
          }
          break;
        case BookmarkType.DOI:
          details.doi = bookmark.doi;
          details.title = bookmark.title;
          break;
        case BookmarkType.OA:
          details.oaWorkId = bookmark.oaWorkId;
          details.title = bookmark.title;
          break;
      }

      return details;
    }),
  );

  return {
    data: filledBookmarks,
    pagination: {
      currentPage: page,
      totalPages: Math.ceil(totalItems / perPage),
      totalItems,
    },
  };
};

export const BookmarkService = {
  createBookmark,
  deleteBookmark,
  getBookmarks,
};
