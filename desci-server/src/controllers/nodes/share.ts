import { Request, Response, NextFunction } from 'express';
import ShortUniqueId from 'short-unique-id';

import prisma from 'client';
import { RequestWithNodeAccess, RequestWithUser } from 'middleware/nodeGuard';

export const createPrivateShare = async (req: Request, res: Response) => {
  const owner = (req as any).user;
  const uuid = req.params.uuid as string;

  const discovery = await prisma.node.findFirst({
    where: {
      uuid: uuid + '.',
      ownerId: owner.id, // TODO: remove this check, done at middleware level of ensureNodeAccess
    },
  });

  if (!discovery) {
    res.sendStatus(403);
    return;
  }

  const shareUUID = new ShortUniqueId({ length: 10 });
  const shareId = shareUUID() as string;

  let privateShare = await prisma.privateShare.findFirst({ where: { nodeUUID: uuid + '.' } });

  if (privateShare) {
    res.send({ ok: true, shareId: privateShare.shareId });
    return;
  }

  privateShare = await prisma.privateShare.create({ data: { shareId, nodeUUID: uuid + '.' } });

  res.send({ ok: true, shareId: privateShare.shareId });
};

export const getPrivateShare = async (req: RequestWithNodeAccess, res: Response) => {
  const owner = req.user;
  const uuid = req.params.uuid as string;
  const node = req.node;

  try {
    // const discovery = await prisma.node.findFirst({
    //   where: {
    //     uuid: uuid + '.',
    //     ownerId: owner.id, // TODO: remove this check, done at middleware level of ensureNodeAccess
    //   },
    // });

    // if (!discovery) {
    //   throw new Error('Node not found');
    // }

    const privateShare = await prisma.privateShare.findFirst({ where: { nodeUUID: uuid + '.' } });

    if (!privateShare) {
      throw new Error('Private share link does not exists.');
    }

    res.send({ ok: true, shareId: privateShare.shareId });
  } catch (e) {
    res.status(403).send({ ok: false, message: e.message || 'Error querying private share link' });
  }
};

export const checkPrivateShareId = async (req: Request, res: Response, next: NextFunction) => {
  const shareId = req.params.shareId as string;

  if (!shareId) {
    res.status(400).send({ ok: false, message: 'ShareId required!' });
    return;
  }

  try {
    const privateShare = await prisma.privateShare.findFirst({ where: { shareId } });

    res.send({ ok: true, share: privateShare });
  } catch (e) {
    res.status(403).send({ ok: false, message: e.message || 'Error querying private share link' });
  }
};

export const revokePrivateShare = async (req: RequestWithNodeAccess, res: Response) => {
  const owner = req.user;
  const uuid = req.params.uuid as string;
  const node = req.node;

  try {
    // const discovery = await prisma.node.findFirst({
    //   where: {
    //     uuid: uuid + '.',
    //     ownerId: owner.id, // TODO: remove this check, done at middleware level of ensureNodeAccess
    //   },
    // });

    // if (!discovery) {
    //   throw new Error('Node not found');
    // }

    await prisma.privateShare.delete({ where: { nodeUUID: uuid + '.' } });

    res.send({ ok: true });
  } catch (e) {
    res.status(403).send({ ok: false, message: e.message || 'Error revoking share link' });
  }
};
