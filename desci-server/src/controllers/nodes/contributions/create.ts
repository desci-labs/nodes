import { Request, Response } from 'express';

import { logger as parentLogger } from '../../../logger.js';
import { contributorService } from '../../../services/Contributors.js';

export const addContributor = async (req: Request, res: Response) => {
  const node = (req as any).node;
  const user = (req as any).user;

  if (!node || !user)
    throw Error('Middleware not properly setup for addContributor controller, requires req.node and req.user');

  const { contributorId, orcid, userId } = req.body;
  let { email } = req.body;
  if (email) email = email.toLowerCase();

  const logger = parentLogger.child({
    module: 'Contributors::createController',
    body: req.body,
    uuid: node.uuid,
    user: (req as any).user,
    nodeId: node.id,
  });

  if (!contributorId) {
    return res.status(400).json({ error: 'contributorId required' });
  }
  if (!userId && !email && !orcid) {
    return res.status(400).json({ error: 'userId, Email or Orcid required' });
  }
  // debugger;
  // Add contributor to the db
  try {
    const contributorAdded = await contributorService.addNodeContribution({
      node,
      nodeOwner: user,
      contributorId,
      email,
      orcid,
      userId,
    });
    if (!contributorAdded) throw Error('Failed to add contributor');
    if (user.id !== contributorAdded.userId) {
      // Generate a share code for the contributor if it's the node owner themselves
      const shareCode = await contributorService.generatePrivShareCodeForContribution(contributorAdded, node);

      // Future:
      // Fire off an email -> make it count as a friend referral
    }
    logger.info({ contributorAdded }, 'Contributor added successfully');
    return res.status(200).json({ message: 'Contributor added successfully' });
  } catch (e) {
    logger.error({ e }, 'Failed to add contributor');
    return res.status(500).json({ error: 'Failed to add contributor' });
  }

  return res.status(500).json({ error: 'Something went wrong' });
};
