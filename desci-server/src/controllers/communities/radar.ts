// import { ResearchObjectV1 } from '@desci-labs/desci-models';
import { NextFunction, Request, Response } from 'express';
import _ from 'lodash';

import { SuccessResponse, asyncMap, communityService, resolveLatestNode } from '../../internal.js';

export const getCommunityRadar = async (req: Request, res: Response, next: NextFunction) => {
  const communityRadar = await communityService.getCommunityRadar(parseInt(req.params.communityId as string));

  // THIS is necessary because the engagement signal returned from getCommunityRadar
  // accounts for only engagements on community selected attestations
  const nodes = await asyncMap(communityRadar, async (node) => {
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
