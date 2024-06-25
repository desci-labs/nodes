import type { Request, Response } from 'express';

import { prisma } from '../../client.js';
import { logger as parentLogger } from '../../logger.js';

const logger = parentLogger.child({
  module: 'NODE::getPublishedNodesController',
});

// type NodeWithDpid = Node & { dpid?: string; isPublished: boolean; index?: IndexedResearchObject };

type GetDraftNodeStatsResponse = {
  ok: true;
  totalDraftNodes: number;
};

export const getDraftNodeStats = async (req: Request<any, any, any>, res: Response<GetDraftNodeStatsResponse>) => {
  const user = (req as any).user;
  const ipfsQuery = req.query.g;

  logger.info({
    body: req.body,
    user: (req as any).user,
    ipfsQuery,
  });

  let nodes = await prisma.node.count({
    where: {
      ownerId: user.id,
      isDeleted: false,
    },
  });

  return res.send({
    ok: true,
    totalDraftNodes: nodes.valueOf(),
  });
};
