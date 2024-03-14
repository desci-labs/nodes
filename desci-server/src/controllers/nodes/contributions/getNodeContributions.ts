import { Request, Response } from 'express';

import { prisma } from '../../../client.js';
import { logger as parentLogger } from '../../../logger.js';
import { contributorService } from '../../../services/Contributors.js';
import { ensureUuidEndsWithDot } from '../../../utils.js';

export const getNodeContributions = async (req: Request, res: Response) => {
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
    // const nodeContributions = await contributorService.retrieveContributionsForNode(node, contributorIds);
    const nodeContributions = await contributorService.retrieveContributionsForNode(node);
    if (nodeContributions) {
      logger.info({ totalContributions: nodeContributions.length }, 'Contributions retrieved successfully');
      return res.status(200).json({ nodeContributions });
    }
  } catch (e) {
    logger.error({ e }, 'Failed to retrieve node contributions');
    return res.status(500).json({ error: 'Failed to retrieve node contributions' });
  }

  return res.status(500).json({ error: 'Something went wrong' });
};
