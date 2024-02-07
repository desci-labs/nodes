import { NextFunction, Request, Response } from 'express';

import { SuccessResponse, asyncMap, communityService, resolveLatestNode } from '../../internal.js';

export const getCommunityFeed = async (req: Request, res: Response, next: NextFunction) => {
  const curatedNodes = await communityService.getCuratedNodes(parseInt(req.params.communityId as string));

  // THIS is necessary because the engagement signal returned from getcuratedNodes
  // accounts for only engagements on community selected attestations
  const nodes = await asyncMap(curatedNodes, async (node) => {
    const engagements = await communityService.getNodeEngagementSignals(
      parseInt(req.params.communityId),
      node.nodeDpid10,
    );
    return {
      node,
      engagements,
    };
  });

  const data = await Promise.all(nodes.map(resolveLatestNode));
  return new SuccessResponse(data).send(res);
};
