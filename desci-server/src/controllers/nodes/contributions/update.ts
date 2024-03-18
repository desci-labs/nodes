import { Request, Response } from 'express';

import { logger as parentLogger } from '../../../logger.js';
import { contributorService } from '../../../services/Contributors.js';

export const updateContributor = async (req: Request, res: Response) => {
  const node = (req as any).node;
  const user = (req as any).user;

  if (!node || !user)
    throw Error('Middleware not properly setup for addContributor controller, requires req.node and req.user');

  const { contributorId, orcid, userId } = req.body;
  let { email } = req.body;
  if (email) email = email.toLowerCase();

  const logger = parentLogger.child({
    module: 'Contributors::updateContributorController',
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

  const contribution = await contributorService.getContributionById(contributorId);
  const currentEmail = contribution?.email;

  // Update contributor in the db
  try {
    const contributorUpdated = await contributorService.updateNodeContribution({
      node,
      nodeOwner: user,
      contributorId,
      email,
      orcid,
      userId,
    });
    if (contributorUpdated) {
      logger.info({ contributorUpdated }, 'Contributor updated successfully');
      // Future:
      if (currentEmail !== email) {
        // If email was changed, send a new email.

        const shareCode = await contributorService.generatePrivShareCodeForContribution(contributorUpdated, node);
        // Fire off an email -> make it count as a friend referral
      }
      return res.status(200).json({ message: 'Contributor updated successfully' });
    }
  } catch (e) {
    logger.error({ e }, 'Failed to update contributor');
    return res.status(500).json({ error: 'Failed to update contributor' });
  }

  return res.status(500).json({ error: 'Something went wrong' });
};
