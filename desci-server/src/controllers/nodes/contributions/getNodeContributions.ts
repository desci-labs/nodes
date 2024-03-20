import { Request, Response } from 'express';

import { prisma } from '../../../client.js';
import { logger as parentLogger } from '../../../logger.js';
import { NodeContributorMap, contributorService } from '../../../services/Contributors.js';
import { ensureUuidEndsWithDot } from '../../../utils.js';

export type GetNodeContributionsReqBody = {
  contributorIds: string[];
};

export type GetNodeContributionsRequest = Request<never, never, GetNodeContributionsReqBody>;

export type GetNodeContributionsResBody =
  | {
      ok: boolean;
      nodeContributions: NodeContributorMap;
    }
  | {
      error: string;
    };

export const getNodeContributions = async (
  req: GetNodeContributionsRequest,
  res: Response<GetNodeContributionsResBody>,
) => {
  const { uuid } = req.params;
  const { contributorIds } = req.body;

  const logger = parentLogger.child({
    module: 'Contributors::getNodeContributionsController',
    body: req.body,
    uuid,
  });

  if (!uuid) {
    return res.status(400).json({ error: 'uuid required' });
  }

  if (!contributorIds) {
    return res.status(400).json({ error: 'contributorIds required' });
  }

  try {
    const node = await prisma.node.findUnique({ where: { uuid: ensureUuidEndsWithDot(uuid) } });
    const nodeContributions: NodeContributorMap = await contributorService.retrieveContributionsForNode(
      node,
      contributorIds,
    );
    if (nodeContributions) {
      logger.info({ totalContributions: nodeContributions.length }, 'Contributions retrieved successfully');
      return res.status(200).json({ ok: true, nodeContributions });
    }
  } catch (e) {
    logger.error({ e }, 'Failed to retrieve node contributions');
    return res.status(500).json({ error: 'Failed to retrieve node contributions' });
  }

  return res.status(500).json({ error: 'Something went wrong' });
};
