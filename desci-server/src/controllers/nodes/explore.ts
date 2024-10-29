import { Request, Response } from 'express';

import { prisma } from '../../client.js';
import { logger as parentLogger } from '../../logger.js';

const logger = parentLogger.child({
  module: 'NODE::exploreController',
});

/**
  In case it's needed to debug/tune on dev/prod instances, this is the SQL query
  that's translated to prisma below:
    - Joins nodes with nodeVersions if there is a non-null anchor/transaction hash
    - This join is grouped by node ID, and sorted by version creation
    - Selects one row per node ID, which yields the top (latest) one
    - From this last-publish CTE, we sort on the creation timestamp and take our page

  WITH latest_versions AS (
    SELECT DISTINCT ON (n.id)
      n.id,
      n.uuid,
      n."dpidAlias",
      nv."manifestUrl" as "recentCid",
      nv."createdAt" as "latestPublish",
      nv."commitId",
      nv."transactionId"
    FROM
      "Node" n
    INNER JOIN "NodeVersion" nv ON n.id = nv."nodeId"
    WHERE
      nv."transactionId" IS NOT NULL OR nv."commitId" IS NOT NULL
    ORDER BY
      n.id,
      nv."createdAt" DESC,
      nv.id DESC -- determinism in case of same anchor time on fast publishes
  )
  SELECT
    "latestPublish",
    uuid,
    "dpidAlias",
    "recentCid",
    "commitId",
    "transactionId"
  FROM latest_versions
  ORDER BY "latestPublish" DESC
  LIMIT $size
  OFFSET ($page - 1) * $size

  The corresponding prisma query build is a bit backward as we start from
  nodeVersion and use nested select instead of the join,
*/

/**
 * Get the latest publish information for the most recently updated nodes,
 */
export const explore = async (req: Request, res: Response) => {
  const page: number = req.query.page ? parseInt(req.query.page as string) : 1;
  const size: number = req.query.size ? parseInt(req.query.size as string) : 10;

  logger.info({ page, size });

  try {
    const freshlyPublishedVersions = await prisma.nodeVersion.findMany({
      where: {
        OR: [{ transactionId: { not: null } }, { commitId: { not: null } }],
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: {
        manifestUrl: true,
        createdAt: true,
        commitId: true,
        transactionId: true,
        node: {
          select: {
            uuid: true,
            dpidAlias: true,
          },
        },
      },
      distinct: ['nodeId'],
      take: size,
      skip: (page - 1) * size,
    });

    const flattened = freshlyPublishedVersions.map((v) => ({
      id: v.node.uuid,
      // Chop off the milliseconds to match epoch format
      time: v.createdAt.valueOf().toString().slice(0, -3),
      recentCid: v.manifestUrl,
      dpid: v.node.dpidAlias,
      commitId: v.commitId,
      transactionId: v.transactionId,
    }));

    return res.send(flattened);
  } catch (e) {
    logger.error({ e, page, size }, 'explore query failed to complete');
    return res.status(500).send();
  }
};
