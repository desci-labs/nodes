import { NodeFeedItem, Prisma } from '@prisma/client';
import { Request, Response } from 'express';

import { prisma } from '../../client.js';
// list feeditems that have FeedItemEndorsement of null organization

export const feed = async (req: Request, res: Response) => {
  // get the latest feed items
  const page = parseInt(req.query.page as string) || 1;
  const size = parseInt(req.query.size as string) || 10;
  const offset = Math.max(0, page - 1) * size;
  const feedItems = await prisma.$queryRaw<NodeFeedItem[]>(
    Prisma.sql`
      SELECT "NodeFeedItem".*, "NodeFeedItemEndorsement"."desciCommunityId" as "endorsementOrganizationId"
      FROM "NodeFeedItem"
      LEFT JOIN "NodeFeedItemEndorsement" ON "NodeFeedItem"."id" = "NodeFeedItemEndorsement"."nodeFeedItemId"
      WHERE "NodeFeedItemEndorsement".id is not null
      ORDER BY "NodeFeedItem"."createdAt" DESC
      LIMIT ${size} OFFSET ${offset}
    `,
  );

  res.send({ feedItem: feedItems });
};
