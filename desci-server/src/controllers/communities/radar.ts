// import { ResearchObjectV1 } from '@desci-labs/desci-models';
import { NextFunction, Request, Response } from 'express';
import _ from 'lodash';

import { SuccessResponse } from '../../core/ApiResponse.js';
import { logger as parentLogger } from '../../logger.js';
import { getFromCache, redisClient, setToCache } from '../../redisClient.js';
import { getCommunityFeedSchema } from '../../routes/v1/communities/schema.js';
import { attestationService } from '../../services/Attestation.js';
import { communityService } from '../../services/Communities.js';
import { asyncMap } from '../../utils.js';

import { getCommunityNodeDetails, resolveLatestNode } from './util.js';

const logger = parentLogger.child({ module: 'GET COMMUNITY RADAR' });
export const getCommunityRadar = async (req: Request, res: Response, next: NextFunction) => {
  const communityRadar = await communityService.getCommunityRadar(parseInt(req.params.communityId as string));
  logger.info({ communityRadar }, 'Radar');
  // THIS is necessary because the engagement signal returned from getCommunityRadar
  // accounts for only engagements on community selected attestations
  const nodes = await asyncMap(communityRadar, async (node) => {
    const engagements = await attestationService.getNodeEngagementSignals(node.nodeDpid10);

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

export const listCommunityRadar = async (req: Request, res: Response, next: NextFunction) => {
  const { query, params } = await getCommunityFeedSchema.parseAsync(req);
  const limit = 20;
  const page = Math.max(Math.max((query.page ?? 0) - 1, 0), 0);
  const offset = limit * page;

  let totalCount = await getFromCache<number>(`radar-${params.communityId}-count`);
  if (!totalCount) {
    totalCount = await communityService.countCommunityRadar(parseInt(params.communityId.toString()));
    logger.trace({ totalCount }, 'RadarCount');
    setToCache(`radar-${params.communityId}-count`, totalCount);
  }

  const communityRadar = await communityService.listCommunityRadar({
    communityId: parseInt(params.communityId.toString()),
    offset,
    limit,
  });

  logger.trace({ offset, page, cursor: query.page }, 'Radar');
  // THIS is necessary because the engagement signal returned from getCommunityRadar
  // accounts for only engagements on community selected attestations
  const entries = await asyncMap(communityRadar, async (entry) => {
    const engagements = await attestationService.getNodeEngagementSignalsByUuid(entry.nodeUuid);
    return {
      ...entry,
      engagements,
      verifiedEngagements: {
        reactions: entry.reactions,
        annotations: entry.annotations,
        verifications: entry.verifications,
      },
    };
  });

  // rank nodes by sum of sum of verified and non verified signals
  const data = await Promise.all(entries.map(getCommunityNodeDetails));
  // logger.trace({ count: data.length }, 'listCommunityRadar');

  return new SuccessResponse({
    data,
    count: totalCount,
    page: page + 1,
    nextPage: data.length === limit ? page + 2 : undefined,
    communityId: params.communityId,
  }).send(res);
};
