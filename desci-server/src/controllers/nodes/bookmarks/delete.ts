import { BookmarkType, User } from '@prisma/client';
import { Request, Response } from 'express';

import { logger as parentLogger } from '../../../logger.js';
import { BookmarkService } from '../../../services/BookmarkService.js';

type DeleteBookmarkParams = {
  type: BookmarkType;
  bId: string; // nodeUuid | DOI | oaWorkId
};

export type DeleteNodeBookmarkRequest = Request<DeleteBookmarkParams, never> & {
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

  const { type, bId } = req.params;
  if (!bId)
    return res.status(400).json({ ok: false, error: 'bId param is required, either a nodeUuid, DOI, or oaWorkId' });

  let deleteParams;
  switch (type) {
    case BookmarkType.NODE:
      deleteParams = { type, nodeUuid: bId };
      break;
    case BookmarkType.DOI:
      deleteParams = { type, doi: bId };
      break;
    case BookmarkType.OA:
      deleteParams = { type, oaWorkId: bId };
      break;
    default:
      return res.status(400).json({
        ok: false,
        error: 'Invalid bookmark type, must be NODE, DOI, or OA',
      });
  }

  const logger = parentLogger.child({
    module: 'Bookmarks::DeleteNodeBookmarkController',
    userId: user.id,
    type,
    bookmarkUniqueId: bId,
  });

  try {
    logger.trace({}, 'Deleting bookmark');
    await BookmarkService.deleteBookmark(user.id, deleteParams);

    return res.status(200).json({ ok: true, message: 'Bookmark deleted successfully' });
  } catch (e) {
    if (e instanceof Error && e.message === 'Bookmark not found') {
      return res.status(404).json({ ok: false, error: 'Bookmark not found' });
    }
    logger.error({ e }, 'Failed to delete bookmark');
    return res.status(500).json({ ok: false, error: 'Failed to delete bookmark' });
  }
};
