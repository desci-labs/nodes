import { ResearchObjectV1, ResearchObjectV1Dpid } from '@desci-labs/desci-models';
import { NodeCover } from '@prisma/client';
import type { Request, Response, NextFunction } from 'express';

import { prisma } from '../../client.js';
// import { resolveNodeManifest } from '../../internal.js';
import { logger as parentLogger } from '../../logger.js';
import { IndexedResearchObject, getIndexedResearchObjects } from '../../theGraph.js';
import { resolveNodeManifest } from '../../utils/manifest.js';
import { decodeBase64UrlSafeToHex, ensureUuidEndsWithDot, randomUUID64 } from '../../utils.js';

const logger = parentLogger.child({
  module: 'NODE::checkIfPublishedNode',
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

type GetPublishedNodeResponse = {
  ok: true;
  uuid?: string;
  dpid?: string;
  isPublished: boolean;
  indexInfo?: IndexedResearchObject;
};

type GetPublishedNodeErrorResponse = {
  ok: false;
  message: string;
};

export const checkIfPublishedNode = async (
  req: Request<any, any, any>,
  res: Response<GetPublishedNodeResponse | GetPublishedNodeErrorResponse>,
) => {
  const ipfsQuery = req.query.g;

  logger.info({
    body: req.body,
    user: (req as any).user,
    ipfsQuery,
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

  // transition UUID
  const indexMap = {};

  if (!node) {
    res.status(404).send({ ok: false, message: 'Node not found' });
    return;
  }

  try {
    const uuids = node.uuid;
    const indexed = await getIndexedResearchObjects([uuids]);
    indexed.researchObjects.forEach((e) => {
      indexMap[e.id] = e;
    });
  } catch (err) {
    logger.error({ err }, '[ERROR] graph index lookup fail');
    // todo: try on chain direct (current method doesnt support batch, so fix that and add here)
  }

  const hex = `0x${decodeBase64UrlSafeToHex(node.uuid)}`;
  const result = indexMap[hex];
  const manifest: ResearchObjectV1 = result?.recentCid
    ? await resolveNodeManifest(result?.recentCid, ipfsQuery as string)
    : null;
  const o = {
    ...node,
    uuid: node?.uuid.replaceAll('.', ''),
    isPublished: !!indexMap[hex],
    index: indexMap[hex],
    dpid: manifest?.dpid,
  };
  delete o.id;

  const enhancedNode: NodeWithDpid = o;

  res.send({
    ok: true,
    uuid: enhancedNode.uuid,
    dpid: enhancedNode.dpid?.id,
    isPublished: enhancedNode.isPublished,
    indexInfo: enhancedNode.index,
  });
};
