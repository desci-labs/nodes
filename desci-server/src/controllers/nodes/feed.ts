import { NodeFeedItem } from '@prisma/client';
import { Sql } from '@prisma/client/runtime/index.js';
import { Request, Response, NextFunction } from 'express';

import { prisma } from '../../client.js';
// list feeditems that have FeedItemEndorsement of null organization

export const feed = async (req: Request, res: Response) => {
  // get the latest feed items
  const page = parseInt(req.query.page as string) || 1;
  const size = parseInt(req.query.size as string) || 10;
  const feedItems = await prisma.$queryRaw<NodeFeedItem>(
    new Sql(
      [
        `
        SELECT "NodeFeedItem".*, "NodeFeedItemEndorsement"."desciCommunityId" as "endorsementOrganizationId"
        from "NodeFeedItem"
        LEFT JOIN "NodeFeedItemEndorsement" ON "NodeFeedItem"."id" = "NodeFeedItemEndorsement"."nodeFeedItemId"
        where "NodeFeedItemEndorsement".id is not null
        ORDER BY "NodeFeedItem"."createdAt" DESC
        LIMIT ${size} OFFSET ${Math.max(0, page - 1) * size}
    
    `,
      ],
      [],
    ),
  );

  res.send({ feedItem: feedItems });
};
