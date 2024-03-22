import { Node, User } from '@prisma/client';
import { Request, Response } from 'express';

import { logger as parentLogger } from '../../../logger.js';
import { contributorService } from '../../../services/Contributors.js';

export type DeleteContributorReqBody = {
  contributorId: string;
};

export type DeleteContributorRequest = Request<never, never, DeleteContributorReqBody> & {
  user: User; // added by auth middleware
  node: Node; // added by ensureWriteAccess middleware
};

export type DeleteContributorResBody =
  | {
      ok: boolean;
      message: string;
    }
  | {
      error: string;
    };

export const deleteContributor = async (req: DeleteContributorRequest, res: Response<DeleteContributorResBody>) => {
  const node = req.node;
  const user = req.user;

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
      return res.status(200).json({ ok: true, message: 'Contributor deleted successfully' });
    }
  } catch (e) {
    logger.error({ e }, 'Failed to delete contributor');
    return res.status(500).json({ error: 'Failed to delete contributor' });
  }

  return res.status(500).json({ error: 'Something went wrong' });
};
