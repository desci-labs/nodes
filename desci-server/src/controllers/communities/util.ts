// import { ResearchObjectV1 } from '@desci-labs/desci-models';
import { Node } from '@prisma/client';
import axios from 'axios';
import _ from 'lodash';

import { NodeRadarWithEngagement, ensureUuidEndsWithDot } from '../../internal.js';
import { NodeUuid, cleanupManifestUrl, logger, prisma, transformManifestWithHistory } from '../../internal.js';
import repoService from '../../services/repoService.js';

export const resolveLatestNode = async (radar: NodeRadarWithEngagement) => {
  let node: Node;

  const uuid = ensureUuidEndsWithDot(radar.node.nodeuuid);

  const discovery = await prisma.node.findFirst({
    where: {
      uuid,
      isDeleted: false,
    },
  });

  if (!discovery) {
    logger.warn({ uuid }, 'uuid not found');
    // res.sendStatus(403);
    // return;
  }

  let gatewayUrl = discovery.manifestUrl;

  try {
    gatewayUrl = cleanupManifestUrl(gatewayUrl);
    logger.trace({ gatewayUrl, uuid }, 'transforming manifest');
    (discovery as any).manifestData = transformManifestWithHistory((await axios.get(gatewayUrl)).data, discovery);
    // Add draft manifest document
    const nodeUuid = (uuid + '.') as NodeUuid;
    const manifest = await repoService.getDraftManifest(nodeUuid);

    logger.info({ manifest }, '[SHOW API GET DRAFT MANIFEST]');

    if (manifest) (discovery as any).manifestData = transformManifestWithHistory(manifest, discovery);
    delete (discovery as any).restBody;
    node = discovery;
    logger.info({}, 'Retrive DraftManifest For /SHOW');
  } catch (err) {
    logger.error({ err, manifestUrl: discovery.manifestUrl, gatewayUrl }, 'nodes/show.ts: failed to preload manifest');
  }

  return { ...radar, node };
};
