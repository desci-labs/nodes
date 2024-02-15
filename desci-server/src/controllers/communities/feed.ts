import { NextFunction, Request, Response } from 'express';
import _ from 'lodash';

import {
  NotFoundError,
  SuccessResponse,
  asyncMap,
  attestationService,
  communityService,
  resolveLatestNode,
} from '../../internal.js';

export const getCommunityFeed = async (req: Request, res: Response, next: NextFunction) => {
  const curatedNodes = await communityService.getCuratedNodes(parseInt(req.params.communityId as string));

  // THIS is necessary because the engagement signal returned from getcuratedNodes
  // accounts for only engagements on community selected attestations
  const nodes = await asyncMap(curatedNodes, async (node) => {
    const engagements = await communityService.getNodeCommunityEngagementSignals(
      parseInt(req.params.communityId),
      node.nodeDpid10,
    );
    return {
      ...node,
      engagements,
    };
  });

  let data = await Promise.all(nodes.map(resolveLatestNode));
  data = data.sort((c1, c2) => {
    const key1 = c1.engagements.verifications + c1.engagements.annotations + c1.engagements.reactions;
    const key2 = c2.engagements.verifications + c2.engagements.annotations + c2.engagements.reactions;
    return key2 - key1;
  });
  return new SuccessResponse(data).send(res);
};

export const getCommunityDetails = async (req: Request, res: Response, next: NextFunction) => {
  const community = await communityService.findCommunityByNameOrSlug(req.params.communityName as string);

  if (!community) throw new NotFoundError('Community not found');

  const engagements = await communityService.getCommunityEngagementSignals(community.id);

  return new SuccessResponse({ community, engagements }).send(res);
};

export const getAllFeeds = async (req: Request, res: Response, next: NextFunction) => {
  const communities = await communityService.getAllCommunities();
  const curatedNodes = await Promise.all(communities.map((c) => communityService.getCuratedNodes(c.id)));

  // THIS is necessary because the engagement signal returned from getcuratedNodes
  // accounts for only engagements on community selected attestations
  let allNodes = curatedNodes.flat();
  allNodes = _.uniqBy(allNodes, 'nodeDpid10');
  const nodes = await asyncMap(allNodes, async (node) => {
    const engagements = await attestationService.getNodeEngagementSignals(node.nodeDpid10);

    // todo: get all attestation signals
    return {
      ...node,
      engagements,
    };
  });

  // logger.info({ nodes }, 'CHECK Verification SignalS');
  let data = await Promise.all(nodes.map(resolveLatestNode));
  // data = data.sort((c1, c2) => c1.engagements.verifications - c2.engagements.verifications);
  data = data.sort((c1, c2) => {
    const key1 = c1.engagements.verifications + c1.engagements.annotations + c1.engagements.reactions;
    const key2 = c2.engagements.verifications + c2.engagements.annotations + c2.engagements.reactions;
    return key2 - key1;
  });

  return new SuccessResponse(data).send(res);
};
