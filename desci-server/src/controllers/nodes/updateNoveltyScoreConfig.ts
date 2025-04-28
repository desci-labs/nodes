import { User, Node } from '@prisma/client';
import { Request, Response } from 'express';
import { z } from 'zod';

import { logger as parentLogger } from '../../logger.js';
import { NoveltyScoreConfig, updateNoveltyScoreConfig } from '../../services/node.js';

export const UpdateNoveltyScoreConfigSchema = z.object({
  hideContentNovelty: z.boolean().optional(),
  hideContextNovelty: z.boolean().optional(),
});

type UpdateNoveltyScoreConfigReqBody = z.infer<typeof UpdateNoveltyScoreConfigSchema>;

export type UpdateNoveltyScoreConfigRequest = Request<{ uuid: string }, never, UpdateNoveltyScoreConfigReqBody> & {
  user: User;
  node: Node;
};

export type UpdateNoveltyScoreConfigResBody =
  | {
      ok: true;
      message: string;
      config: NoveltyScoreConfig;
    }
  | {
      ok: false;
      error: string;
      details?: z.ZodIssue[] | string;
    };

/**
 * Updates the UI visibility of the novelty scores for a node.
 */
export const updateNoveltyScoreConfigController = async (
  req: UpdateNoveltyScoreConfigRequest,
  res: Response<UpdateNoveltyScoreConfigResBody>,
) => {
  const user = req.user;
  const node = req.node;
  const { uuid } = req.params;

  if (!user) throw Error('Middleware not properly setup for updateNoveltyScoreConfigController, requires req.user');

  const logger = parentLogger.child({
    module: 'Nodes::UpdateNoveltyScoreConfigController',
    userId: user.id,
    nodeUuid: uuid,
    body: req.body,
  });

  try {
    const validatedConfig = UpdateNoveltyScoreConfigSchema.parse(req.body);

    if (node.ownerId !== user.id) {
      logger.warn({ nodeOwnerId: node.ownerId }, `User ${user.id} does not own node: ${node.id}`);
      return res.status(403).json({ ok: false, error: 'Unauthorized' });
    }

    logger.trace({ config: validatedConfig }, 'Updating novelty score config');

    const updatedNode = await updateNoveltyScoreConfig(node, validatedConfig);

    return res.status(200).json({
      ok: true,
      message: 'Novelty score configuration updated successfully',
      config: updatedNode.noveltyScoreConfig as NoveltyScoreConfig,
    });
  } catch (e) {
    if (e instanceof z.ZodError) {
      logger.warn({ error: e.errors }, 'Invalid request parameters');
      return res.status(400).json({ ok: false, error: 'Invalid request parameters', details: e.errors });
    }

    logger.error({ e }, 'Error updating novelty score config');
    return res.status(500).json({ ok: false, error: 'Internal server error' });
  }
};
