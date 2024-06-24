// import { randomBytes } from 'crypto';

import { ResearchObjectV1, ResearchObjectV1Dpid } from '@desci-labs/desci-models';
import axios from 'axios';
import { Request, Response, NextFunction } from 'express';

import { prisma } from '../../client.js';
import { resolveNodeManifest } from '../../internal.js';
import { logger as parentLogger } from '../../logger.js';
import { IndexedResearchObject, getIndexedResearchObjects } from '../../theGraph.js';
import { asyncMap, decodeBase64UrlSafeToHex, randomUUID64 } from '../../utils.js';
import { Node } from '@prisma/client';

const logger = parentLogger.child({
  module: 'NODE::getPublishedNodes',
});
// type NodeWithDpid =  { dpid?: ResearchObjectV1Dpid; isPublished: boolean; index?: IndexedResearchObject };
export const getPublishedNodes = async (req: Request, res: Response, next: NextFunction) => {
  const owner = (req as any).user;
  const ipfsQuery = req.query.g;

  // implement paging
  const page: number = req.query.page ? parseInt(req.query.page as string) : 1;
  const limit: number = req.query.limit ? parseInt(req.query.limit as string) : 20;

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
  });
  logger.info({ nodes }, 'nodeess');
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

  let foundNodes = await asyncMap(nodes, async (n) => {
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

  logger.info({ foundNodes }, 'foundNodes');

  foundNodes = foundNodes.filter((n) => n.isPublished);
  foundNodes = foundNodes.slice((page - 1) * limit, page * limit);

  res.send({ nodes: foundNodes });
};
