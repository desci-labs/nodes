import { Request, Response } from 'express';

import { logger as parentLogger } from '../../../logger.js';
import { contributorService } from '../../../services/Contributors.js';

export const deleteContributor = async (req: Request, res: Response) => {
  const node = (req as any).node;
  const user = (req as any).user;

  if (!node || !user)
    throw Error('Middleware not properly setup for addContributor controller, requires req.node and req.user');

  const { contributorId } = req.body;

  const logger = parentLogger.child({
    module: 'Contributors::deleteContributorController',
    body: req.body,
    uuid: node.uuid,
    user: (req as any).user,
    nodeId: node.id,
  });

  if (!contributorId) {
    return res.status(400).json({ error: 'contributorId required' });
  }

  // Remove contributor entry from the db
  try {
    const contributorRemoved = await contributorService.removeContributor(contributorId, node.id);
    if (contributorRemoved) {
      logger.info('Contributor deleted successfully');
      return res.status(200).json({ message: 'Contributor deleted successfully' });
    }
  } catch (e) {
    logger.error({ e }, 'Failed to delete contributor');
    return res.status(500).json({ error: 'Failed to delete contributor' });
  }

  return res.status(500).json({ error: 'Something went wrong' });
};
