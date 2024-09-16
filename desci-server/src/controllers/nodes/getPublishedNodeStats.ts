import type { Request, Response } from 'express';
import { prisma } from '../../client.js';
import { logger as parentLogger } from '../../logger.js';

const logger = parentLogger.child({
  module: 'NODE::getPublishedNodesController',
});

type GetPublishedNodeStatsResponse = {
  ok: true;
  totalPublishedNodes: number;
};

export const getPublishedNodeStats = async (
  req: Request<any, any, any>,
  res: Response<GetPublishedNodeStatsResponse>,
) => {
  const owner = (req as any).user;
  const ipfsQuery = req.query.g;

  logger.info({
    body: req.body,
    user: (req as any).user,
    ipfsQuery,
  });

  // _count unavailable in prisma <4.16
  let publishedNodeIds = await prisma.node.findMany({
    select: {
      id: true
    },
    where: {
      ownerId: owner.id,
      versions: {
        some: {
          OR: [
            { transactionId: { not: null }},
            { commitId: { not: null }},
          ]
        }
      }
    },
  });

  const totalPublishedNodes = publishedNodeIds.length;

  logger.info({ totalPublishedNodes }, 'totalPublishedNodes');

  res.send({
    ok: true,
    totalPublishedNodes,
  });
};
