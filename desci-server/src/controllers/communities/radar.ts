// import { ResearchObjectV1 } from '@desci-labs/desci-models';
import { Node } from '@prisma/client';
import axios from 'axios';
import { NextFunction, Request, Response } from 'express';
import _ from 'lodash';

import {
  CommunityRadarNode,
  NodeUuid,
  SuccessResponse,
  cleanupManifestUrl,
  communityService,
  ensureUuidEndsWithDot,
  logger,
  prisma,
  transformManifestWithHistory,
} from '../../internal.js';
import repoService from '../../services/repoService.js';

export const getCommunityRadar = async (req: Request, res: Response, next: NextFunction) => {
  const communityRadar = await communityService.getCommunityRadar(parseInt(req.params.desciCommunityId as string));
  // const data = communities.map((community) => _.pick(community, ['id', 'name', 'description', 'image_url']));

  // TODO: for each node uuid in the radar, resolve the latest version of the node;
  const data = await Promise.all(communityRadar.map(resolveLatestNode));
  return new SuccessResponse(data).send(res, {});
};

const resolveLatestNode = async (radar: {
  NodeAttestation: CommunityRadarNode[];
  nodeDpid10: string;
  nodeuuid: string;
}) => {
  let node: Node;

  const uuid = ensureUuidEndsWithDot(radar.nodeuuid);

  const discovery = await prisma.node.findFirst({
    where: {
      uuid,
      isDeleted: false,
    },
  });

  if (!discovery) {
    logger.warn({ uuid: radar.nodeuuid }, 'uuid not found');
    // res.sendStatus(403);
    // return;
  }

  let gatewayUrl = discovery.manifestUrl;

  try {
    gatewayUrl = cleanupManifestUrl(gatewayUrl);
    logger.trace({ gatewayUrl, uuid: radar.nodeuuid }, 'transforming manifest');
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
