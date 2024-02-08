import { NextFunction, Request, Response } from 'express';

import { SuccessResponse, asyncMap, communityService, resolveLatestNode } from '../../internal.js';

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
      node,
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
