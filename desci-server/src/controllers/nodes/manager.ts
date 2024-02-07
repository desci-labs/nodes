import { Request, Response, NextFunction } from 'express';

import { prisma } from '../../client.js';
import { logger as parentLogger } from '../../logger.js';
import { ensureUuidEndsWithDot } from '../../utils.js';

export const deleteNode = async (req: Request, res: Response, next: NextFunction) => {
  const user = (req as any).user;
  const uuid = req.params.uuid as string;
  const logger = parentLogger.child({
    // id: req.id,
    module: 'NODE::deleteController',
    body: req.body,
    uuid,
    user: (req as any).user,
  });
  logger.trace(`deleteNode ${uuid}`);
  const node = await prisma.node.findFirst({ where: { uuid: ensureUuidEndsWithDot(uuid) } });

  logger.info({ node }, 'delete');

  if (user.id !== node.ownerId) {
    res.status(401).send({ ok: false, message: 'Unauthorized' });
    return;
  }

  const deleted = await prisma.node.update({
    where: { id: node.id },
    data: { isDeleted: true, deletedAt: new Date() },
  });
  logger.info({ deleted }, 'soft deleted');
  res.status(200).send({ ok: true });
};
