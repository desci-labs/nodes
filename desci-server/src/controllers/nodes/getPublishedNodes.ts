import { Request, Response } from 'express';
import { cachedGetDpidFromManifest } from '../../internal.js';
import { logger as parentLogger } from '../../logger.js';
import { asyncMap } from '../../utils.js';
import { User } from '@prisma/client';
import { listAllUserNodes, PublishedNode } from './list.js';

const logger = parentLogger.child({
  module: 'NODE::getPublishedNodes',
});

type PublishedNodesQueryParams = {
  /** Alternative IPFS gateway */
  g?: string;
  page?: string;
  size?: string;
};

// User populated by auth middleware
type PublishedNodesRequest =
  Request<never, never, never, PublishedNodesQueryParams> & { user: User };

type PublishedNodesResponse = Response<{
  nodes: PublishedNode[];
}>;

export const getPublishedNodes = async (
  req: PublishedNodesRequest,
  res: PublishedNodesResponse,
) => {
  const owner = req.user;
  const gateway = req.query.g;

  const page: number = req.query.page ? parseInt(req.query.page as string) : 1;
  const size: number = req.query.size ? parseInt(req.query.size as string) : 20;

  logger.info({
    queryParams: req.query,
    gateway,
  }, "getting published nodes");

  const nodes = await listAllUserNodes(owner.id, page, size, true);
  const publishedNodes = nodes.filter(n => n.versions.length);

  const formattedNodes = await asyncMap( publishedNodes, async n => {
      const versionIx = n.versions.length - 1;
      const cid = n.versions[0].manifestUrl;
      const dpid = n.dpidAlias ?? await cachedGetDpidFromManifest(cid, gateway);
      const publishedAt = n.versions[0].createdAt;

      return {
        uuid: n.uuid.replace(".", ""),
        title: n.title,
        createdAt: n.createdAt,
        versionIx,
        publishedAt,
        isPublished: true as const,
        dpid,
      };
    });

  return res.send({ nodes: formattedNodes });
};
