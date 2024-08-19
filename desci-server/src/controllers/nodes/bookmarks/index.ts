import { IpldUrl, ResearchObjectV1Dpid } from '@desci-labs/desci-models';
import { User } from '@prisma/client';
import { Request, Response } from 'express';

import { prisma } from '../../../client.js';
import { getLatestManifestFromNode } from '../../../internal.js';
import { logger as parentLogger } from '../../../logger.js';
import { getIndexedResearchObjects } from '../../../theGraph.js';

export type BookmarkedNode = {
  uuid: string;
  manifestCid: string;
  title?: string;
  versions: number;
  coverImageCid?: string | IpldUrl;
  published?: boolean;
  dpid?: ResearchObjectV1Dpid;
  publishDate?: string;
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
      include: {
        node: true,
      },
    });

    logger.trace({ bookmarkedNodesLength: bookmarkedNodes.length }, 'Bookmarked nodes retrieved successfully');

    if (bookmarkedNodes?.length === 0) {
      return res.status(200).json({ ok: true, bookmarkedNodes: [] });
    }

    const nodeUuids = bookmarkedNodes.map((bm) => bm.node.uuid);
    const { researchObjects } = await getIndexedResearchObjects(nodeUuids);

    logger.trace({ researchObjectsLength: researchObjects.length }, 'Research objects retrieved successfully');

    const publishedNodesMap = researchObjects.reduce((acc, ro) => {
      try {
        // convert hex string to integer
        const nodeUuidInt = Buffer.from(ro.id.substring(2), 'hex');
        // convert integer to hex
        const nodeUuid = nodeUuidInt.toString('base64url');
        acc[nodeUuid] = ro;
      } catch (e) {
        logger.error({ acc, ro, e, message: e?.message }, 'Failed to convert hex string to integer');
      }
      return acc;
    }, {});

    logger.trace(
      { publishedNodesMapKeyLength: Object.keys(publishedNodesMap).length },
      'Published nodes map created successfully',
    );

    const filledBookmarkedNodes = await Promise.all(
      bookmarkedNodes.map(async (bm) => {
        const { node } = bm;
        const latestManifest = await getLatestManifestFromNode(node);
        const publishedEntry = publishedNodesMap[node.uuid];

        return {
          uuid: node.uuid,
          manifestCid: node.manifestUrl,
          title: latestManifest.title,
          versions: publishedEntry?.versions.length,
          coverImageCid: latestManifest.coverImage,
          dpid: latestManifest.dpid,
          publishDate: publishedEntry?.versions[0].time,
          published: !!publishedEntry,
          shareKey: bm.shareId,
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
