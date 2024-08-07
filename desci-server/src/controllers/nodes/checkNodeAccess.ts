import { ResearchObjectV1, ResearchObjectV1Dpid } from '@desci-labs/desci-models';
import { NodeCover } from '@prisma/client';
import type { Request, Response } from 'express';

import { prisma } from '../../client.js';
import { resolveNodeManifest } from '../../internal.js';
import { logger as parentLogger } from '../../logger.js';
import { IndexedResearchObject, getIndexedResearchObjects } from '../../theGraph.js';
import { decodeBase64UrlSafeToHex, ensureUuidEndsWithDot, randomUUID64 } from '../../utils.js';

const logger = parentLogger.child({
  module: 'NODE::checkNodeAccess',
});

type NodeWithDpid = {
  uuid: string;
  createdAt: Date;
  updatedAt: Date;
  ownerId: number;
  title: string;
  manifestUrl: string;
  cid: string;
  NodeCover: NodeCover[];
  isPublished: boolean;
} & { dpid?: ResearchObjectV1Dpid; isPublished: boolean; index?: IndexedResearchObject };

type GetCheckNodeAccessResponse = {
  ok: true;
  uuid?: string;
  isOwner: boolean;
  isShared: boolean;
  hasAccess: boolean;
  sharedOn?: number;
  isPublished: boolean;
  recentCid?: string;
  index?: IndexedResearchObject;
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
  // debugger;
  const privSharedNode = !!shareId
    ? await prisma.privateShare.findFirst({
        where: {
          nodeUUID: node.uuid,
          shareId: shareId,
        },
      })
    : undefined;

  // transition UUID
  const indexMap = {};

  try {
    const uuids = node.uuid;
    const indexed = await getIndexedResearchObjects([uuids]);
    indexed.researchObjects.forEach((e) => {
      indexMap[e.id] = e;
    });
  } catch (err) {
    logger.error({ err: err.message }, '[ERROR] graph index lookup fail');
    // todo: try on chain direct (current method doesnt support batch, so fix that and add here)
  }

  const hex = `0x${decodeBase64UrlSafeToHex(node.uuid)}`;
  const result = indexMap[hex];
  const manifest: ResearchObjectV1 = result?.recentCid
    ? await resolveNodeManifest(result?.recentCid, ipfsQuery as string)
    : null;
  const o = {
    ...node,
    uuid: node.uuid.replaceAll('.', ''),
    isPublished: !!indexMap[hex],
    index: indexMap[hex],
    dpid: manifest?.dpid,
  };
  delete o.id;

  const enhancedNode: NodeWithDpid = o;

  const isOwner = owner?.id === enhancedNode.ownerId;
  const latestDraftVersion = await prisma.nodeVersion.findFirst({
    where: {
      nodeId: node.id,
    },
    orderBy: {
      createdAt: 'desc',
    },
  });

  const hasAccess = privSharedNode?.nodeUUID === node.uuid || isOwner;
  res.send({
    ok: true,
    uuid: enhancedNode.uuid,
    isOwner,
    isShared: !isOwner && !!privSharedNode,
    hasAccess,
    isPublished: enhancedNode.isPublished,
    sharedOn: privSharedNode?.createdAt.getTime(),
    recentCid: enhancedNode.index?.recentCid,
    index: enhancedNode.index,
    manifestUrl: hasAccess ? latestDraftVersion?.manifestUrl : undefined,
  });
};
