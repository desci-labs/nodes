import { Node, NodeVersion } from '@prisma/client';
import axios from 'axios';
import _ from 'lodash';

import { NodeRadar, ensureUuidEndsWithDot } from '../../internal.js';
import { NodeUuid, cleanupManifestUrl, logger, prisma } from '../../internal.js';
import repoService from '../../services/repoService.js';
import { getIndexedResearchObjects } from '../../theGraph.js';

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
    (await prisma.$queryRaw`SELECT * from "NodeVersion" where "nodeId" = ${discovery.id} AND "transactionId" IS NOT NULL ORDER BY "createdAt" DESC`) as NodeVersion[];

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
    const manifest = await repoService.getDraftManifest(uuid as NodeUuid);
    radar.manifest = manifest;
    logger.error({ err, manifestUrl: discovery.manifestUrl, gatewayUrl }, 'nodes/show.ts: failed to preload manifest');
  }

  radar.node = { ...radar.node, ...node };
  return radar;
};

export const getNodeVersion = async (uuid: string) => {
  try {
    const { researchObjects } = await getIndexedResearchObjects([uuid]);
    const result = researchObjects?.[0];
    return result?.versions?.length ?? 0;
  } catch (e) {}
};
