// import { randomBytes } from 'crypto';

import { ResearchObjectV1 } from '@desci-labs/desci-models';
import axios from 'axios';
import { Request, Response, NextFunction } from 'express';

import { prisma } from '../../client.js';
import { resolveNodeManifest } from '../../internal.js';
import { logger as parentLogger } from '../../logger.js';
import { getIndexedResearchObjects } from '../../theGraph.js';
import { asyncMap, decodeBase64UrlSafeToHex, randomUUID64 } from '../../utils.js';

const logger = parentLogger.child({
  module: 'NODE::listController',
});

export const list = async (req: Request, res: Response, next: NextFunction) => {
  const owner = (req as any).user;
  const ipfsQuery = req.query.g;

  // implement paging
  const page: number = req.query.page ? parseInt(req.query.page as string) : 1;
  const limit: number = req.query.limit ? parseInt(req.query.limit as string) : 20;

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
    },
    orderBy: { updatedAt: 'desc' },
    // take: limit,
    // skip: (page - 1) * limit,
  });

  // transition UUID
  const ns = nodes.filter((a) => !a.uuid);
  if (ns.length) {
    await Promise.all(
      ns.map(
        async (n) =>
          await prisma.node.update({
            where: {
              id: n.id,
            },
            data: {
              uuid: randomUUID64(),
            },
          }),
      ),
    );
    nodes = await prisma.node.findMany({
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
      },
      orderBy: { updatedAt: 'desc' },
    });
  }
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

  nodes = await asyncMap(nodes, async (n) => {
    const hex = `0x${decodeBase64UrlSafeToHex(n.uuid)}`;
    const result = indexMap[hex];
    const manifest: ResearchObjectV1 = result?.recentCid ? await resolveNodeManifest(result?.recentCid) : null;
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

  res.send({ nodes });
};
