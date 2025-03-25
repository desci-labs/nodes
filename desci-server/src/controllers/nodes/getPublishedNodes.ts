import { User } from '@prisma/client';
import { Request, Response } from 'express';

import { logger as parentLogger } from '../../logger.js';
import { cachedGetDpidFromManifest, cachedGetManifestAndDpid } from '../../utils/manifest.js';
import { asyncMap } from '../../utils.js';

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
type PublishedNodesRequest = Request<never, never, never, PublishedNodesQueryParams> & { user: User };

type PublishedNodesResponse = Response<{
  nodes: PublishedNode[];
}>;

export const getPublishedNodes = async (req: PublishedNodesRequest, res: PublishedNodesResponse) => {
  const owner = req.user;
  const gateway = req.query.g;

  const page: number = req.query.page ? parseInt(req.query.page as string) : 1;
  const size: number = req.query.size ? parseInt(req.query.size as string) : 20;

  logger.info(
    {
      queryParams: req.query,
      gateway,
    },
    'getting published nodes',
  );

  const nodes = await listAllUserNodes(owner.id, page, size, true);
  const publishedNodes = nodes.filter((n) => n.versions.length);

  const formattedNodes = await asyncMap(publishedNodes, async (n) => {
    const versionIx = n.versions.length - 1;
    const cid = n.versions[0].manifestUrl;
    let dpid = n.dpidAlias;
    let title = n.title;
    const cachedResult = await cachedGetManifestAndDpid(cid, gateway);
    title = cachedResult?.manifest?.title ?? title;
    if (!n.dpidAlias) {
      dpid = cachedResult?.dpid;
    }
    const publishedAt = n.versions[0].createdAt;

    return {
      dpid,
      title,
      versionIx,
      publishedAt,
      createdAt: n.createdAt,
      isPublished: true as const,
      uuid: n.uuid.replace('.', ''),
    };
  });

  return res.send({ nodes: formattedNodes });
};
