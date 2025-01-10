import { ResearchObjectV1 } from '@desci-labs/desci-models';
import { Node, NodeVersion } from '@prisma/client';
import axios from 'axios';
import _ from 'lodash';

import { prisma } from '../../client.js';
import { logger } from '../../logger.js';
import { RadarEntry } from '../../services/Communities.js';
import { NodeUuid } from '../../services/manifestRepo.js';
import repoService from '../../services/repoService.js';
import { IndexedResearchObject, getIndexedResearchObjects } from '../../theGraph.js';
import { cleanupManifestUrl } from '../../utils/manifest.js';
import { ensureUuidEndsWithDot } from '../../utils.js';

import { NodeRadar } from './types.js';

export const resolveLatestNode = async (radar: Partial<NodeRadar>) => {
  const uuid = ensureUuidEndsWithDot(radar.nodeuuid);

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
    },
  });

  if (!discovery) {
    logger.warn({ uuid }, 'uuid not found');
  }

  const selectAttributes: (keyof typeof discovery)[] = ['ownerId', 'NodeCover'];
  const node: Partial<Node & { versions: number }> = _.pick(discovery, selectAttributes);
  const publishedVersions =
    (await prisma.$queryRaw`SELECT * from "NodeVersion" where "nodeId" = ${discovery.id} AND ("transactionId" IS NOT NULL or "commitId" IS NOT NULL) ORDER BY "createdAt" DESC`) as NodeVersion[];

  // const nodeVersions = (await getNodeVersion
  logger.info({ uuid: discovery.uuid, publishedVersions }, 'Resolve node');
  node['versions'] = publishedVersions.length;
  node['publishedDate'] = publishedVersions[0].createdAt;
  node.manifestUrl = publishedVersions[0].manifestUrl;
  radar.node = node;

  let gatewayUrl = publishedVersions[0].manifestUrl;

  try {
    gatewayUrl = cleanupManifestUrl(gatewayUrl);
    logger.trace({ gatewayUrl, uuid }, 'transforming manifest');
    const manifest = (await axios.get(gatewayUrl)).data;
    radar.manifest = manifest;

    logger.info({ manifest }, '[SHOW API GET LAST PUBLISHED MANIFEST]');
  } catch (err) {
    const manifest = await repoService.getDraftManifest({
      uuid: node.uuid as NodeUuid,
      documentId: node.manifestDocumentId,
    });
    radar.manifest = manifest;
    logger.error({ err, manifestUrl: discovery.manifestUrl, gatewayUrl }, 'nodes/show.ts: failed to preload manifest');
  }

  radar.node = { ...radar.node, ...node };
  return radar;
};

export const getCommunityNodeDetails = async (
  radar: RadarEntry & { node?: Partial<Node & { versions: number }>; manifest?: ResearchObjectV1 },
) => {
  const uuid = ensureUuidEndsWithDot(radar.nodeUuid);

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
    },
  });

  if (!discovery) {
    logger.warn({ uuid }, 'uuid not found');
  }

  const selectAttributes: (keyof typeof discovery)[] = ['ownerId', 'NodeCover'];
  const node: Partial<Node & { versions: number }> = _.pick(discovery, selectAttributes);
  const publishedVersions =
    (await prisma.$queryRaw`SELECT * from "NodeVersion" where "nodeId" = ${discovery.id} AND ("transactionId" IS NOT NULL or "commitId" IS NOT NULL) ORDER BY "createdAt" DESC`) as NodeVersion[];

  // const nodeVersions = (await getNodeVersion
  logger.info({ uuid: discovery.uuid, publishedVersions }, 'Resolve node');
  node['versions'] = publishedVersions.length;
  node['publishedDate'] = publishedVersions[0].createdAt;
  node.manifestUrl = publishedVersions[0].manifestUrl;
  radar.node = node;

  let gatewayUrl = publishedVersions[0].manifestUrl;

  try {
    gatewayUrl = cleanupManifestUrl(gatewayUrl);
    // logger.trace({ gatewayUrl, uuid }, 'transforming manifest');
    const manifest = (await axios.get(gatewayUrl)).data;
    radar.manifest = manifest;

    // logger.info({ manifest }, '[SHOW API GET LAST PUBLISHED MANIFEST]');
  } catch (err) {
    const manifest = await repoService.getDraftManifest({
      uuid: node.uuid as NodeUuid,
      documentId: node.manifestDocumentId,
    });
    radar.manifest = manifest;
    logger.error({ err, manifestUrl: discovery.manifestUrl, gatewayUrl }, 'nodes/show.ts: failed to preload manifest');
  }

  radar.node = { ...radar.node, ...node };
  return radar;
};

export const getNodeVersion = async (uuid: string) => {
  let indexingResults: { researchObjects: IndexedResearchObject[] };
  try {
    indexingResults = await getIndexedResearchObjects([uuid]);
    const researchObject = indexingResults.researchObjects[0];
    return researchObject?.versions?.length ?? 0;
  } catch (e) {
    logger.error({ uuid, indexingResults }, 'getNodeVersion failed');
    throw e;
  }
};
