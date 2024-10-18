import { User } from '@prisma/client';
import { Request, Response } from 'express';

import { prisma } from '../../../client.js';
// import { getLatestManifestFromNode } from '../../../internal.js';
import { logger as parentLogger } from '../../../logger.js';
import { getLatestManifestFromNode } from '../../../services/manifestRepo.js';

export type BookmarkedNode = {
  uuid: string;
  title?: string;
  published?: boolean;
  dpid?: number;
  shareKey: string;
};
export type ListBookmarkedNodesRequest = Request<never, never> & {
  user: User; // added by auth middleware
};

export type ListBookmarkedNodesResBody =
  | {
      ok: boolean;
      bookmarkedNodes: BookmarkedNode[];
    }
  | {
      error: string;
    };

export const listBookmarkedNodes = async (
  req: ListBookmarkedNodesRequest,
  res: Response<ListBookmarkedNodesResBody>,
) => {
  const user = req.user;

  if (!user) throw Error('Middleware not properly setup for ListBookmarkedNodes controller, requires req.user');

  const logger = parentLogger.child({
    module: 'PrivateShare::ListBookmarkedNodesController',
    body: req.body,
    userId: user.id,
  });

  try {
    logger.trace({}, 'Retrieving bookmarked nodes for user');
    const bookmarkedNodes = await prisma.bookmarkedNode.findMany({
      where: {
        userId: user.id,
      },
      select: {
        shareId: true,
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
    });

    logger.trace({ bookmarkedNodesLength: bookmarkedNodes.length }, 'Bookmarked nodes retrieved successfully');

    if (bookmarkedNodes?.length === 0) {
      return res.status(200).json({ ok: true, bookmarkedNodes: [] });
    }

    const filledBookmarkedNodes = await Promise.all(
      bookmarkedNodes.map(async ({ shareId, node }) => {
        const latestManifest = await getLatestManifestFromNode(node);
        const manifestDpid = latestManifest.dpid ? parseInt(latestManifest.dpid.id) : undefined;
        const published = node.versions.length > 0;

        return {
          uuid: node.uuid,
          title: latestManifest.title,
          dpid: node.dpidAlias ?? manifestDpid,
          published,
          shareKey: shareId,
        };
      }),
    );
    logger.trace({ filledBookmarkedNodesLength: filledBookmarkedNodes.length }, 'Bookmarked nodes filled successfully');

    if (filledBookmarkedNodes) {
      logger.info(
        { totalBookmarkedNodesFound: filledBookmarkedNodes.length },
        'Bookmarked nodes retrieved successfully',
      );
      return res.status(200).json({ ok: true, bookmarkedNodes: filledBookmarkedNodes });
    }
  } catch (e) {
    logger.error({ e, message: e?.message }, 'Failed to retrieve bookmarked nodes for user');
    return res.status(500).json({ error: 'Failed to retrieve bookmarked nodes' });
  }

  return res.status(500).json({ error: 'Something went wrong' });
};
