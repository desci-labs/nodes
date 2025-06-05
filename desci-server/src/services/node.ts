import { ResearchObjectV1 } from '@desci-labs/desci-models';
import { Node, NodeVersion, Prisma } from '@prisma/client';
import axios from 'axios';
import _ from 'lodash';

import { prisma } from '../client.js';
import { logger as parentLogger } from '../logger.js';
import { getFromCache, setToCache } from '../redisClient.js';
import { cleanupManifestUrl } from '../utils/manifest.js';
import { ensureUuidEndsWithDot } from '../utils.js';

import { CommunitySubmissionItem } from './Communities.js';
import { getManifestByCid } from './data/processing.js';
import { NodeUuid } from './manifestRepo.js';
import repoService from './repoService.js';

export async function getDpidFromNode(node: Node, manifest?: ResearchObjectV1): Promise<number | string | undefined> {
  let dpid: string | number = node.dpidAlias;
  if (!dpid) {
    const manifestCid = node.manifestUrl;
    try {
      const manifestUsed = manifest ? manifest : await getManifestByCid(manifestCid);
      dpid = manifestUsed?.dpid?.id;
    } catch (e) {
      // let undefined return
    }
  }

  return dpid;
}
export const getNodeByDpid = async (dpid: number) => {
  return prisma.node.findUnique({
    where: { dpidAlias: dpid },
    select: { uuid: true, dpidAlias: true },
  });
};

export async function getDpidFromNodeUuid(nodeUuid: string): Promise<number | string | undefined> {
  const node = await prisma.node.findUnique({
    where: { uuid: ensureUuidEndsWithDot(nodeUuid) },
    select: { dpidAlias: true, manifestUrl: true },
  });
  let dpid: string | number = node.dpidAlias;
  if (!dpid) {
    const manifestCid = node.manifestUrl;
    try {
      const manifest = await getManifestByCid(manifestCid);
      dpid = manifest?.dpid?.id;
    } catch (e) {
      // let undefined return
    }
  }

  return dpid;
}

export async function getLikesByUuid(nodeUuid: string) {
  return prisma.nodeLike.findMany({
    where: { nodeUuid },
  });
}

export async function countLikesByUuid(nodeUuid: string) {
  return prisma.nodeLike.count({
    where: { nodeUuid },
  });
}

export async function likeNode(data: Prisma.NodeLikeCreateArgs['data']) {
  return await prisma.nodeLike.upsert({
    where: { nodeUuid_userId: { userId: data.userId, nodeUuid: data.nodeUuid } },
    create: { userId: data.userId, nodeUuid: data.nodeUuid },
    update: {},
  });
}

export async function unlikeNode(id: number) {
  return await prisma.nodeLike.delete({
    where: { id },
  });
}

export async function getUserNodeLike(userId: number, nodeUuid: string) {
  return prisma.nodeLike.findFirst({
    where: { userId, nodeUuid },
  });
}

export async function getNodeLikesCountInRange({ from, to }: { from: string | Date; to: string | Date }) {
  return prisma.nodeLike.count({
    where: { createdAt: { gte: from, lt: to } },
  });
}
export async function getNodeLikesInRange({ from, to }: { from: string | Date; to: string | Date }) {
  return prisma.nodeLike.findMany({
    where: { createdAt: { gte: from, lt: to } },
    select: { createdAt: true },
  });
}

export const getPublishedNodesInRange = async (range: { from: Date; to: Date }) => {
  const publishes = (await prisma.$queryRaw`SELECT
    DISTINCT nv."nodeId",
    MAX(nv."createdAt") AS "createdAt"
FROM
    "Node" node
    JOIN "NodeVersion" nv ON nv."createdAt" >= ${range.from}
    AND nv."createdAt" < ${range.to}
    AND (
        nv."transactionId" IS NOT NULL
        OR nv."commitId" IS NOT NULL
    )
GROUP BY
    nv."nodeId";
        `) as { nodeId: number; createdAt: string }[];

  return publishes;
};

export const countPublishedNodesInRange = async (range: { from: Date; to: Date }) => {
  const result = await prisma.nodeVersion.groupBy({
    by: ['nodeId'],
    _count: {
      _all: true,
    },
    where: {
      createdAt: {
        gte: range.from,
        lt: range.to,
      },
      OR: [
        {
          transactionId: {
            not: null,
          },
        },
        {
          commitId: {
            not: null,
          },
        },
      ],
    },
  });
  return result.length;
};

const NODE_DETAILS_CACHE_KEY = `NODE_DETAILS_CACHE_KEY`;

export interface NodeDetails {
  versions?: number;
  publishedDate?: Date;
  manifestUrl?: string;
  dpid?: number;
  dpidAlias?: number;
  authors?: any[];
}

export const getNodeDetails = async (discovery: CommunitySubmissionItem['node']) => {
  if (!discovery) return {};

  const logger = parentLogger.child({ module: 'getNodeDetails' });

  const nodeVersion = discovery?.versions?.length ?? 0;
  const latestVersion = discovery?.versions?.[0];
  const cacheKey = `${NODE_DETAILS_CACHE_KEY}_${discovery.id}_${latestVersion?.manifestUrl}`;

  const cachedDetails = await getFromCache<NodeDetails>(cacheKey);
  logger.trace({ cacheKey, hit: !!cachedDetails }, 'CACHE check');
  if (cachedDetails) return cachedDetails;

  const data: Record<string, any> = {};
  logger.trace({ uuid: discovery.uuid, latestVersion }, 'Resolve node');

  data['versions'] = nodeVersion;
  if (latestVersion) {
    data['publishedDate'] = latestVersion.createdAt;
    data['manifestUrl'] = latestVersion.manifestUrl;
  }
  const resolvedDpid = discovery.dpidAlias || discovery.legacyDpid;
  data.dpid = resolvedDpid;
  data.dpidAlias = resolvedDpid; // Ensure dpidAlias is set using legacy dpid if not present

  try {
    const manifest = await repoService.getDraftManifest({
      uuid: discovery.uuid as NodeUuid,
      documentId: discovery.manifestDocumentId,
    });
    logger.trace({ manifestFound: !!manifest }, '[repoService.getDraftManifest]');
    data.authors = manifest.authors;
  } catch (err) {
    let gatewayUrl = latestVersion?.manifestUrl ?? discovery?.manifestUrl;
    if (gatewayUrl !== undefined) {
      gatewayUrl = cleanupManifestUrl(gatewayUrl);
      // logger.trace({ gatewayUrl, uuid }, 'transforming manifest');
      const manifest = (await axios.get(gatewayUrl)).data;
      data.authors = manifest.authors;
    }
    logger.error({ err, manifestUrl: discovery.manifestUrl, gatewayUrl }, 'nodes/show.ts: failed to preload manifest');
  }

  await setToCache(cacheKey, data);
  return data;
};

export interface NoveltyScoreConfig {
  hideContentNovelty?: boolean;
  hideContextNovelty?: boolean;
}

/**
 * Visually hides the novelty scores for a node in the UI.
 */
export async function updateNoveltyScoreConfig(
  node: Pick<Node, 'id' | 'noveltyScoreConfig'>,
  config: NoveltyScoreConfig,
) {
  const hideContentNovelty = config.hideContentNovelty;
  const hideContextNovelty = config.hideContextNovelty;

  const previousConfig = node.noveltyScoreConfig as NoveltyScoreConfig;

  const newConfig = {
    ...previousConfig,
    ...(hideContentNovelty !== undefined && { hideContentNovelty }),
    ...(hideContextNovelty !== undefined && { hideContextNovelty }),
  };

  return prisma.node.update({
    where: { id: node.id },
    data: {
      noveltyScoreConfig: newConfig,
    },
  });
}
