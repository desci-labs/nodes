// import { ResearchObjectV1 } from '@desci-labs/desci-models';
import { NextFunction, Request, Response } from 'express';
import _ from 'lodash';

import {
  SuccessResponse,
  asyncMap,
  communityService,
  logger as parentLogger,
  resolveLatestNode,
} from '../../internal.js';

const logger = parentLogger.child({ module: 'GET COMMUNITY RADAR' });
export const getCommunityRadar = async (req: Request, res: Response, next: NextFunction) => {
  const communityRadar = await communityService.getCommunityRadar(parseInt(req.params.communityId as string));

  // THIS is necessary because the engagement signal returned from getCommunityRadar
  // accounts for only engagements on community selected attestations
  const nodes = await asyncMap(communityRadar, async (node) => {
    const engagements = await communityService.getNodeCommunityEngagementSignals(
      parseInt(req.params.communityId),
      node.nodeDpid10,
    );

    const verifiedEngagements = node.NodeAttestation.reduce(
      (total, claim) => ({
        reactions: total.reactions + claim.reactions,
        annotations: total.annotations + claim.annotations,
        verifications: total.verifications + claim.verifications,
      }),
      { reactions: 0, annotations: 0, verifications: 0 },
    );

    logger.info({ verifiedEngagements }, 'CHECK Verification SignalS');

    // todo: get all attestation signals
    return {
      ...node,
      engagements,
      verifiedEngagements,
    };
  });

  // rank nodes by sum of sum of verified and non verified signals

  logger.info({ nodes }, 'CHECK Verification SignalS');
  let data = await Promise.all(nodes.map(resolveLatestNode));

  /**
   * Sort based on engagment metrics/signal on (entry attestations)
   * (nodes with lower metrics should come first)
   * or
   * fallback to last submission/attestation claim date
   */
  data = data.sort((entryA, entryB) => {
    if (entryA.verifiedEngagements.verifications !== entryB.verifiedEngagements.verifications)
      return entryA.verifiedEngagements.verifications - entryB.verifiedEngagements.verifications;

    const entryALastClaimedAt = new Date(entryA.NodeAttestation[entryA.NodeAttestation.length - 1].claimedAt).getTime();
    const entryBlastClaimedAt = new Date(entryB.NodeAttestation[entryB.NodeAttestation.length - 1].claimedAt).getTime();
    return entryBlastClaimedAt - entryALastClaimedAt;
  });

  return new SuccessResponse(data).send(res);
};
