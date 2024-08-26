import { Request, Response } from 'express';
import { prisma } from '../../client.js';
import { cachedGetDpidFromManifest } from '../../internal.js';
import { logger as parentLogger } from '../../logger.js';
import { asyncMap } from '../../utils.js';
import { User } from '@prisma/client';

const logger = parentLogger.child({
  module: 'NODE::getPublishedNodes',
});

type PublishedNodesQueryParams = {
  /** Alternative IPFS gateway */
  g?: string;
  page?: string;
  size?: string;
};

type PublishedNodesRequest = 
  Request<never, never, never, PublishedNodesQueryParams> & { user: User };

type PublishedNode = {
    uuid: string;
    /** Current version index */
    versionIx: number;
    /** The latest published manifest CID */
    cid: string;
    /** Datetime of latest publish */
    publishedAt: Date;
    /** Current title of the node (could have changed after publish) */
    title: string;
    /** Creation time of the node */
    createdAt: Date;
    dpid?: number;
};

type PublishedNodesResponse = Response<{
  nodes: PublishedNode[];
}>;

export const getPublishedNodes = async (
  req: PublishedNodesRequest,
  res: PublishedNodesResponse,
) => {
  const owner = req.user;
  const gateway = req.query.g;

  // implement paging
  const page: number = req.query.page ? parseInt(req.query.page as string) : 1;
  const size: number = req.query.size ? parseInt(req.query.size as string) : 20;

  const publishedNodes = await prisma.node.findMany({
    select: {
      uuid: true,
      title: true,
      createdAt: true,
      dpidAlias: true,
      versions: {
        select: {
          manifestUrl: true,
          createdAt: true,
          commitId: true,
          transactionId: true,
        },
        where: {
          OR: [
            { transactionId: { not: null }},
            { commitId: { not: null }},
          ]
        },
        orderBy: { createdAt: "desc" }
      }
    },
    where: {
      ownerId: owner.id,
      isDeleted: false,
      // Without additional filter, we'll get results with empty versions array
      versions: {
        some: {
          OR: [
            { transactionId: { not: null }},
            { commitId: { not: null }},
          ]
        }
       }
    },
    // Note this is the node update, not time of last publish
    orderBy: { updatedAt: "desc" },
    take: size,
    skip: (page -1) * size,
  });

  const formattedNodes = await asyncMap(publishedNodes, async n => {
    const versionIx = n.versions.length - 1;
    const cid = n.versions[0].manifestUrl;
    const publishedAt = n.versions[0].createdAt;

    return {
      uuid: n.uuid.replace(".", ""),
      title: n.title,
      createdAt: n.createdAt,
      cid,
      versionIx,
      publishedAt,
      dpid: n.dpidAlias ?? await cachedGetDpidFromManifest(cid, gateway),
    };
  });

  res.send({ nodes: formattedNodes });
};
