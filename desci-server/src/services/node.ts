import { ResearchObjectV1 } from '@desci-labs/desci-models';
import { Node, Prisma } from '@prisma/client';

import { prisma } from '../client.js';
import { ensureUuidEndsWithDot } from '../utils.js';

import { getManifestByCid } from './data/processing.js';

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
