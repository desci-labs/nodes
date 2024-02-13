import { Node } from '@prisma/client';
import axios from 'axios';
import _ from 'lodash';

import { NodeRadar, ensureUuidEndsWithDot } from '../../internal.js';
import { NodeUuid, cleanupManifestUrl, logger, prisma, transformManifestWithHistory } from '../../internal.js';
import repoService from '../../services/repoService.js';

export const resolveLatestNode = async (radar: Partial<NodeRadar>) => {
  const uuid = ensureUuidEndsWithDot(radar.nodeuuid);

  const discovery = await prisma.node.findFirst({
    where: {
      uuid,
      isDeleted: false,
    },
  });

  if (!discovery) {
    logger.warn({ uuid }, 'uuid not found');
  }

  const selectAttributes = ['manifestUrl', 'ownerId', 'title'];
  const node: Partial<Node> = _.pick(discovery, selectAttributes);
  radar.node = node;

  let gatewayUrl = discovery.manifestUrl;

  try {
    gatewayUrl = cleanupManifestUrl(gatewayUrl);
    logger.trace({ gatewayUrl, uuid }, 'transforming manifest');
    const manifest = transformManifestWithHistory((await axios.get(gatewayUrl)).data, discovery);
    radar.manifest = manifest;

    logger.info({ manifest }, '[SHOW API GET DRAFT MANIFEST]');

    logger.info({}, 'Retrive DraftManifest For /SHOW');
  } catch (err) {
    const manifest = await repoService.getDraftManifest(uuid as NodeUuid);
    radar.manifest = manifest;
    logger.error({ err, manifestUrl: discovery.manifestUrl, gatewayUrl }, 'nodes/show.ts: failed to preload manifest');
  }

  radar.node = { ...radar.node, ...node };
  return radar;
};
