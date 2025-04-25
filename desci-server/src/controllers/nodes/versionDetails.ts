import { Request, Response, NextFunction } from 'express';

import { prisma } from '../../client.js';
import { logger as parentLogger } from '../../logger.js';
import { transformGuestDataRefsToDataRefs } from '../../utils/dataRefTools.js';

// call node publish service and add job to queue
export const versionDetails = async (req: Request, res: Response, next: NextFunction) => {
  const transactionId = req.query.transactionId as string;
  // const email = (req as any).user.email;
  const logger = parentLogger.child({
    // id: req.id,
    module: 'NODE::versionDetailsController',
    body: req.body,
    transactionId,
    user: (req as any).user,
  });

  if (!transactionId) {
    return res.status(404).send({ message: 'transactionId must be valid' });
  }

  try {
    // const owner = await prisma.user.findFirst({
    //   where: {
    //     email,
    //   },
    // });

    // if (!owner.id || owner.id < 1) {
    //   throw Error('User ID mismatch');
    // }

    // update node version
    const nodeVersion = await prisma.nodeVersion.findFirst({
      where: {
        transactionId,
      },
    });
    // console.log('[NODE VERSION]::', nodeVersion);
    if (!nodeVersion) {
      // console.log(`unauthed node user: ${owner.email}, transactionID is not published`);
      return res.status(400).json({ error: 'Failed: transactionID is not published' });
    }

    const node = await prisma.node.findFirst({
      where: {
        id: nodeVersion.nodeId,
      },
    });

    const nodeOwner = await prisma.user.findFirst({ where: { id: node.ownerId }, select: { isGuest: true } });

    const publicDataReferences = await prisma.publicDataReference.findMany({
      where: {
        versionId: nodeVersion.id,
      },
      include: { mirrors: true },
    });

    const dataReferences = nodeOwner.isGuest
      ? await prisma.guestDataReference.findMany({
          where: {
            nodeId: node.id,
          },
        })
      : await prisma.dataReference.findMany({
          where: {
            nodeId: node.id,
          },
        });

    let refsReturned = dataReferences;
    if (nodeOwner.isGuest && dataReferences?.length > 0) {
      // sanitize refs, not sure why we return them here anyway?
      refsReturned = transformGuestDataRefsToDataRefs(dataReferences);
    }

    return res.send({
      ok: true,
      node,
      nodeVersion,
      dataReferences: refsReturned,
      publicDataReferences,
    });
  } catch (err) {
    logger.error({ err }, 'node-publish-err');
    return res.status(400).send({ ok: false, error: err.message });
  }
};
