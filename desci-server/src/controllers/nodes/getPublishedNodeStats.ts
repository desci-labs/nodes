import type { Request, Response, NextFunction } from 'express';

import { prisma } from '../../client.js';
import { NodeUuid, resolveNodeManifest } from '../../internal.js';
import { logger as parentLogger } from '../../logger.js';
import { type ThumbnailMap, thumbnailsService } from '../../services/Thumbnails.js';
import { asyncMap, decodeBase64UrlSafeToHex, ensureUuidEndsWithDot, randomUUID64 } from '../../utils.js';
import { IndexedResearchObject, getIndexedResearchObjects } from '../../theGraph.js';
import { ResearchObjectV1, ResearchObjectV1Dpid } from '@desci-labs/desci-models';
import { Node, NodeCover } from '@prisma/client';

const logger = parentLogger.child({
  module: 'NODE::getPublishedNodesController',
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

type GetPublishedNodeStatsResponse = {
  ok: true;
  totalPublishedNodes: number;
};

export const getPublishedNodeStats = async (
  req: Request<any, any, any>,
  res: Response<GetPublishedNodeStatsResponse>,
) => {
  const owner = (req as any).user;
  const ipfsQuery = req.query.g;

  logger.info({
    body: req.body,
    user: (req as any).user,
    ipfsQuery,
  });

  let nodes = await prisma.node.findMany({
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
      ownerId: owner.id,
      isDeleted: false,
      ceramicStream: {
        not: null,
      },
    },
    orderBy: { updatedAt: 'desc' },
    // take: limit,
    // skip: (page - 1) * limit,
  });

  // transition UUID
  const indexMap = {};

  try {
    const uuids = nodes.map((n) => n.uuid);
    const indexed = await getIndexedResearchObjects(uuids);
    indexed.researchObjects.forEach((e) => {
      indexMap[e.id] = e;
    });
  } catch (err) {
    logger.error({ err: err.message }, '[ERROR] graph index lookup fail');
    // todo: try on chain direct (current method doesnt support batch, so fix that and add here)
  }

  logger.info({ indexMap }, 'indexMap');
  logger.info({ nodes }, 'nodes');

  const enhancedNodes = await asyncMap(nodes, async (n) => {
    const hex = `0x${decodeBase64UrlSafeToHex(n.uuid)}`;
    const result = indexMap[hex];
    const manifest: ResearchObjectV1 = result?.recentCid
      ? await resolveNodeManifest(result?.recentCid, ipfsQuery as string)
      : null;
    const o = {
      ...n,
      uuid: n.uuid.replaceAll('.', ''),
      isPublished: !!indexMap[hex],
      index: indexMap[hex],
      dpid: manifest?.dpid,
    };
    delete o.id;

    return o;
  });
  logger.info({ enhancedNodes }, 'enhancedNodes');

  const totalPublishedNodes = enhancedNodes.filter((n) => n.isPublished).length;
  logger.info({ totalPublishedNodes }, 'totalPublishedNodes');

  res.send({
    ok: true,
    totalPublishedNodes,
  });
};
