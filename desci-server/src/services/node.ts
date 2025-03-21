import { ResearchObjectV1 } from '@desci-labs/desci-models';
import { Node, NodeVersion, Prisma } from '@prisma/client';
import axios from 'axios';
import _ from 'lodash';

import { prisma } from '../client.js';
import { logger as parentLogger } from '../logger.js';
import { cleanupManifestUrl } from '../utils/manifest.js';
import { ensureUuidEndsWithDot } from '../utils.js';

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

export const getPublishedNodesInRange = async (range: { from: Date; to: Date }) => {
  const publishes = await prisma.nodeVersion.findMany({
    where: {
      createdAt: {
        gte: range.from,
        lt: range.to,
      },
      OR: [{ transactionId: { not: null } }, { commitId: { not: null } }],
    },
    select: {
      createdAt: true,
    },
  });

  return publishes;
};

export const countPublishedNodesInRange = async (range: { from: Date; to: Date }) => {
  const publishes = await prisma.nodeVersion.count({
    where: {
      createdAt: {
        gte: range.from,
        lt: range.to,
      },
      OR: [{ transactionId: { not: null } }, { commitId: { not: null } }],
    },
  });

  return publishes;
};

export const getNodeDetails = async (nodeUuid: string) => {
  const logger = parentLogger.child({ module: 'getNodeDetails' });
  const uuid = ensureUuidEndsWithDot(nodeUuid);

  const discovery = await prisma.node.findFirst({
    where: {
      uuid,
      isDeleted: false,
    },
    select: {
      id: true,
      manifestUrl: true,
      ownerId: true,
      uuid: true,
      title: true,
      NodeCover: true,
      dpidAlias: true,
      manifestDocumentId: true,
    },
  });

  if (!discovery) {
    logger.warn({ uuid }, 'uuid not found');
  }

  const selectAttributes: (keyof typeof discovery)[] = ['ownerId', 'NodeCover', 'dpidAlias', 'manifestDocumentId'];
  const node: Partial<Node & { versions: number; dpid?: number }> = _.pick(discovery, selectAttributes);
  const publishedVersions =
    (await prisma.$queryRaw`SELECT * from "NodeVersion" where "nodeId" = ${discovery.id} AND ("transactionId" IS NOT NULL or "commitId" IS NOT NULL) ORDER BY "createdAt" DESC`) as NodeVersion[];

  const data: { [key: string]: any } = {};
  logger.info({ uuid: discovery.uuid, publishedVersions }, 'Resolve node');
  data['versions'] = publishedVersions.length;
  data['publishedDate'] = publishedVersions[0].createdAt;
  node.manifestUrl = publishedVersions[0].manifestUrl;
  // data.node = node;
  data.dpid = node.dpidAlias;

  let gatewayUrl = publishedVersions[0].manifestUrl;

  try {
    const manifest = await repoService.getDraftManifest({
      uuid: uuid as NodeUuid,
      documentId: node.manifestDocumentId,
    });
    logger.info({ manifestFound: !!manifest }, '[SHOW API GET LAST PUBLISHED MANIFEST]');
    data.authors = manifest.authors;
  } catch (err) {
    gatewayUrl = cleanupManifestUrl(gatewayUrl);
    // logger.trace({ gatewayUrl, uuid }, 'transforming manifest');
    const manifest = (await axios.get(gatewayUrl)).data;
    data.authors = manifest.authors;

    logger.error({ err, manifestUrl: discovery.manifestUrl, gatewayUrl }, 'nodes/show.ts: failed to preload manifest');
  }
  return data;
};
