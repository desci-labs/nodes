import type { Request, Response } from 'express';
import { prisma } from '../../client.js';
import { logger as parentLogger } from '../../logger.js';
import { ensureUuidEndsWithDot } from '../../utils.js';

const logger = parentLogger.child({
  module: 'NODE::checkNodeAccess',
});

type GetCheckNodeAccessResponse = {
  ok: true;
  uuid?: string;
  isOwner: boolean;
  isShared: boolean;
  hasAccess: boolean;
  sharedOn?: number;
  isPublished: boolean;
  recentCid?: string;
  manifestUrl?: string;
};

type GetCheckNodeAccessErrorResponse = {
  ok: false;
  message: string;
};

export const checkNodeAccess = async (
  req: Request<any, any, any, { g?: string; shareId?: string }>,
  res: Response<GetCheckNodeAccessResponse | GetCheckNodeAccessErrorResponse>,
) => {
  const owner = (req as any).user;
  const ipfsQuery = req.query.g;
  const { shareId } = req.query;

  logger.info({
    body: req.body,
    user: (req as any).user,
    ipfsQuery,
    shareId,
  });

  const node = await prisma.node.findFirst({
    select: {
      uuid: true,
      id: true,
      createdAt: true,
      updatedAt: true,
      ownerId: true,
      title: true,
      manifestUrl: true,
      cid: true,
      NodeCover: true,
      versions: {
        select: {
          manifestUrl: true,
          transactionId: true,
          commitId: true,
        },
        orderBy: { createdAt: "desc" },
      },
    },
    where: {
      isDeleted: false,
      uuid: ensureUuidEndsWithDot(req.params.uuid),
    },
  });

  if (!node) {
    res.status(404).send({ ok: false, message: 'Node not found' });
    return;
  }
  
  const privSharedNode = !!shareId
    ? await prisma.privateShare.findFirst({
        where: {
          nodeUUID: node.uuid,
          shareId: shareId,
        },
      })
    : undefined;

  const isOwner = owner?.id === node.ownerId;
  const hasAccess = privSharedNode?.nodeUUID === node.uuid || isOwner;
  const latestPublishedVersion = node.versions
    .find(nv => nv.transactionId !== null || nv.commitId !== null);
  const isPublished = !!latestPublishedVersion;

  res.send({
    ok: true,
    uuid: node.uuid,
    isOwner,
    isShared: !isOwner && !!privSharedNode,
    hasAccess,
    isPublished,
    sharedOn: privSharedNode?.createdAt.getTime(),
    recentCid: latestPublishedVersion?.manifestUrl,
    manifestUrl: hasAccess ? node.versions[0]?.manifestUrl : undefined,
  });
};
