import { Request, Response, NextFunction } from 'express';
import ShortUniqueId from 'short-unique-id';

import prisma from 'client';
import { RequestWithNodeAccess, RequestWithUser } from 'middleware/nodeGuard';

export const createPrivateShare = async (req: RequestWithNodeAccess, res: Response) => {
  const uuid = req.params.uuid as string;

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
  const uuid = req.params.uuid as string;

  try {
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
  const uuid = req.params.uuid as string;

  try {
    await prisma.privateShare.delete({ where: { nodeUUID: uuid + '.' } });

    res.send({ ok: true });
  } catch (e) {
    res.status(403).send({ ok: false, message: e.message || 'Error revoking share link' });
  }
};
