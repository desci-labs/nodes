import { Prisma, PrismaClient, User } from '@prisma/client';
import { Request, Response } from 'express';

import { prisma } from '../../client.js';
// import { cachedGetDpidFromManifest } from '../../internal.js';
import { logger as parentLogger } from '../../logger.js';
import { cachedGetDpidFromManifest } from '../../utils/manifest.js';
import { asyncMap, randomUUID64 } from '../../utils.js';

const logger = parentLogger.child({
  module: 'NODE::listController',
});

type UserNodesQueryParams = {
  /** Alternative IPFS gateway */
  g?: string;
  page?: string;
  size?: string;
};

// User populated by auth middleware
type UserNodesRequest = Request<never, never, never, UserNodesQueryParams> & { user: User };

export type UserNode = PublishedNode | DraftNode;

export type PublishedNode = {
  uuid: string;
  /** Current version index */
  versionIx: number;
  /** Datetime of latest publish */
  publishedAt: Date;
  /** Current title of the node (could have changed after publish) */
  title: string;
  /** Creation time of the node */
  createdAt: Date;
  /** dPID, from alias or legacy manifest entry */
  dpid: number;
  /** Whether the node has published versions */
  isPublished: true;
};

export type DraftNode = {
  uuid: string;
  /** Current title of the node (could have changed after publish) */
  title: string;
  /** Creation time of the node */
  createdAt: Date;
  /** Whether the node has published versions */
  isPublished: false;
};

type UserNodesResponse = Response<{
  nodes: UserNode[];
}>;

export const list = async (req: UserNodesRequest, res: UserNodesResponse) => {
  const owner = req.user;
  const gateway = req.query.g;

  const page: number = req.query.page ? parseInt(req.query.page as string) : 1;
  const size: number = req.query.size ? parseInt(req.query.size as string) : 10;

  logger.info(
    {
      queryParams: req.query,
      gateway,
    },
    'getting all user nodes',
  );

  let nodes = await listAllUserNodes(owner.id, page, size);

  // Create uuid for any old nodes, and re-fetch if so
  const nodesWithoutUuid = nodes.filter((a) => !a.uuid);
  if (nodesWithoutUuid.length) {
    await Promise.all(
      nodesWithoutUuid.map(
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
    nodes = await listAllUserNodes(owner.id, page, size);
  }

  const formattedNodes = await asyncMap(nodes, async (n) => {
    logger.info({ uuid: n.uuid, versions: n.versions });
    const isPublished = n.versions.length > 0;

    const draftInfo = {
      uuid: n.uuid.replace('.', ''),
      title: n.title,
      createdAt: n.createdAt,
    };

    if (isPublished) {
      const cid = n.versions[0].manifestUrl;
      return {
        ...draftInfo,
        dpid: n.dpidAlias ?? (await cachedGetDpidFromManifest(cid, gateway)),
        versionIx: n.versions.length - 1,
        publishedAt: n.versions[0].createdAt,
        isPublished: true as const,
      };
    } else {
      return {
        ...draftInfo,
        isPublished: false as const,
      };
    }
  });

  res.send({ nodes: formattedNodes });
};

/** List all nodes for the given user, including published versions, if any */
export const listAllUserNodes = async (ownerId: number, page: number, size: number, onlyPublished = false) =>
  await prisma.node.findMany({
    select: {
      id: true,
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
          OR: [{ transactionId: { not: null } }, { commitId: { not: null } }],
        },
        orderBy: { createdAt: 'desc' },
      },
    },
    where: {
      ownerId,
      isDeleted: false,
      // Can't filter afterward with onlyPublished because then paging won't make sense
      ...(onlyPublished ? onlyPublishedFilter : {}),
    },
    // Note this is the node update, not time of last publish
    orderBy: { updatedAt: 'desc' },
    take: size,
    skip: (page - 1) * size,
  });

const onlyPublishedFilter: { versions: Prisma.NodeVersionListRelationFilter } = {
  versions: {
    some: {
      OR: [{ transactionId: { not: null } }, { commitId: { not: null } }],
    },
  },
};
