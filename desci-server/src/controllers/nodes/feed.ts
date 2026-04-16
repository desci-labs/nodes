import { NodeFeedItem, Prisma } from '@prisma/client';
import { Request, Response } from 'express';

import { prisma } from '../../client.js';
// list feeditems that have FeedItemEndorsement of null organization

export const feed = async (req: Request, res: Response) => {
  // get the latest feed items
  const MAX_PAGE_SIZE = 100;
  const rawPage = Number(req.query.page);
  const rawSize = Number(req.query.size);
  const page = Number.isInteger(rawPage) && rawPage > 0 ? rawPage : 1;
  const size = Number.isInteger(rawSize) && rawSize > 0 ? Math.min(rawSize, MAX_PAGE_SIZE) : 10;
  const offset = (page - 1) * size;
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
