import type { Request, Response } from 'express';

import { prisma } from '../../client.js';
import { logger as parentLogger } from '../../logger.js';
import { NoveltyScoreConfig } from '../../services/node.js';
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
  isPublished: boolean;
  ceramicStream?: string;
  dpidAlias?: number;
  sharedOn?: number;
  recentCid?: string;
  manifestUrl?: string;
  noveltyScoreConfig?: NoveltyScoreConfig;
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
      ownerId: true,
      manifestUrl: true,
      dpidAlias: true,
      ceramicStream: true,
      versions: {
        select: {
          manifestUrl: true,
          transactionId: true,
          commitId: true,
        },
        orderBy: { createdAt: 'desc' },
      },
      noveltyScoreConfig: true,
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
  const latestPublishedVersion = node.versions.find((nv) => nv.transactionId !== null || nv.commitId !== null);
  const isPublished = !!latestPublishedVersion;

  res.send({
    ok: true,
    uuid: node.uuid,
    isOwner,
    isShared: !isOwner && !!privSharedNode,
    hasAccess,
    isPublished,
    ceramicStream: node.ceramicStream,
    dpidAlias: node.dpidAlias,
    sharedOn: privSharedNode?.createdAt.getTime(),
    recentCid: latestPublishedVersion?.manifestUrl,
    manifestUrl: hasAccess ? node.versions[0]?.manifestUrl : undefined,
    noveltyScoreConfig: node.noveltyScoreConfig as NoveltyScoreConfig,
  });
};
