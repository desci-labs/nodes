import { Request, Response } from 'express';

import { logger as parentLogger } from '../../../logger.js';
import { contributorService } from '../../../services/Contributors.js';

export const addContributor = async (req: Request, res: Response) => {
  const node = (req as any).node;
  const user = (req as any).user;

  if (!node || !user)
    throw Error('Middleware not properly setup for addContributor controller, requires req.node and req.user');

  const { contributorId } = req.body;
  let { email } = req.body;
  email = email.toLowerCase();

  const logger = parentLogger.child({
    module: 'Contributors::createController',
    body: req.body,
    uuid: node.uuid,
    user: (req as any).user,
    nodeId: node.id,
  });

  if (!contributorId || !email) {
    return res.status(400).json({ error: 'contributorId and email required' });
  }

  // Add contributor to the db
  try {
    const contributorAdded = await contributorService.addNodeContribution(node, user, contributorId, email);
    if (contributorAdded) {
      logger.info({ contributorAdded }, 'Contributor added successfully');
      return res.status(200).json({ message: 'Contributor added successfully' });
    }
  } catch (e) {
    logger.error({ e }, 'Failed to add contributor');
    return res.status(500).json({ error: 'Failed to add contributor' });
  }

  // Future:
  // Gen a priv link
  // Fire off an email -> make it count as a friend referral

  return res.status(500).json({ error: 'Something went wrong' });
};
