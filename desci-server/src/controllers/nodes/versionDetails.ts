import { Request, Response, NextFunction } from 'express';

import prisma from 'client';

// call node publish service and add job to queue
export const versionDetails = async (req: Request, res: Response, next: NextFunction) => {
  const transactionId = req.query.transactionId as string;
  const email = (req as any).user.email;

  if (!transactionId) {
    return res.status(404).send({ message: 'transactionId must be valid' });
  }

  try {
    const owner = await prisma.user.findFirst({
      where: {
        email,
      },
    });

    if (!owner.id || owner.id < 1) {
      throw Error('User ID mismatch');
    }

    // update node version
    const nodeVersion = await prisma.nodeVersion.findFirst({
      where: {
        transactionId,
      },
    });
    // console.log('[NODE VERSION]::', nodeVersion);
    if (!nodeVersion) {
      console.log(`unauthed node user: ${owner.email}, transactionID is not published`);
      return res.status(400).json({ error: 'failed' });
    }

    const node = await prisma.node.findFirst({
      where: {
        id: nodeVersion.nodeId,
      },
    });

    const publicDataReferences = await prisma.publicDataReference.findMany({
      where: {
        versionId: nodeVersion.id,
      },
      include: { mirrors: true },
    });

    const dataReferences = await prisma.dataReference.findMany({
      where: {
        nodeId: node.id,
      },
    });

    return res.send({
      ok: true,
      node,
      nodeVersion,
      dataReferences,
      publicDataReferences,
    });
  } catch (err) {
    console.error('node-publish-err', err);
    return res.status(400).send({ ok: false, error: err.message });
  }
};
