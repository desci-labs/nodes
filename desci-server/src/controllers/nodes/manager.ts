import { Request, Response, NextFunction } from 'express';

import prisma from 'client';

export const deleteNode = async (req: Request, res: Response, next: NextFunction) => {
  const user = (req as any).user;
  const uuid = req.params.uuid as string;
  console.log('deleteNode', uuid, user);
  const node = await prisma.node.findFirst({ where: { uuid: uuid + '.' } });

  console.log('delete', uuid, node, user);

  if (user.id !== node.ownerId) {
    res.status(401).send({ ok: false, message: 'Unauthorized' });
    return;
  }

  const deleted = await prisma.node.update({
    where: { id: node.id },
    data: { isDeleted: true, deletedAt: new Date() },
  });
  console.log('soft deleted', deleted);
  res.status(200).send({ ok: true });
};
