import { NextFunction, Request, Response } from 'express';
import _ from 'lodash';
import z from 'zod';

import { NotFoundError } from '../../core/ApiError.js';
import { SuccessResponse } from '../../core/ApiResponse.js';
import { logger as parentLogger } from '../../logger.js';
import { getFromCache, setToCache } from '../../redisClient.js';
import { getCommunityFeedSchema } from '../../routes/v1/communities/schema.js';
import { attestationService } from '../../services/Attestation.js';
import { communityService } from '../../services/Communities.js';
import { asyncMap } from '../../utils.js';

import { getCommunityNodeDetails, resolveLatestNode } from './util.js';

const logger = parentLogger.child({ module: 'communities/feed.ts' });

export const getCommunityFeed = async (req: Request, res: Response, next: NextFunction) => {
  const curatedNodes = await communityService.getCuratedNodes(parseInt(req.params.communityId as string));

  // THIS is necessary because the engagement signal returned from getcuratedNodes
  // accounts for only engagements on community selected attestations
  const nodes = await asyncMap(curatedNodes, async (node) => {
    const engagements = await attestationService.getNodeEngagementSignals(node.nodeDpid10);

    const verifiedEngagements = node.NodeAttestation.reduce(
      (total, claim) => ({
        reactions: total.reactions + claim.reactions,
        annotations: total.annotations + claim.annotations,
        verifications: total.verifications + claim.verifications,
      }),
      { reactions: 0, annotations: 0, verifications: 0 },
    );
    return {
      ...node,
      engagements,
      verifiedEngagements,
    };
  });

  let data = await Promise.all(nodes.map(resolveLatestNode));
  data = data
    .sort((c1, c2) => {
      const key1 = c1.engagements.verifications + c1.engagements.annotations + c1.engagements.reactions;
      const key2 = c2.engagements.verifications + c2.engagements.annotations + c2.engagements.reactions;
      return key2 - key1;
    })
    .reverse();
  return new SuccessResponse(data).send(res);
};

export const listCommunityFeed = async (req: Request, res: Response, next: NextFunction) => {
  const { query, params } = await getCommunityFeedSchema.parseAsync(req);
  const limit = 20;
  const page = Math.max(Math.max((query.page ?? 0) - 1, 0), 0);
  const offset = limit * page;

  let totalCount = await getFromCache<number>(`curated-${params.communityId}-count`);
  if (!totalCount) {
    totalCount = await communityService.countCommunityCuratedFeed(parseInt(params.communityId.toString()));
    logger.trace({ totalCount }, 'FeedCount');
    setToCache(`curated-${params.communityId}-count`, totalCount);
  }

  const curatedNodes = await communityService.listCommunityCuratedFeed({
    communityId: parseInt(params.communityId.toString()),
    offset,
    limit,
  });
  logger.trace({ offset, page }, 'Feed');
  // THIS is necessary because the engagement signal returned from getcuratedNodes
  // accounts for only engagements on community selected attestations
  const entries = await asyncMap(curatedNodes, async (entry) => {
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

  const data = await Promise.all(entries.map(getCommunityNodeDetails));
  // logger.info({ count: data.length, page: offset }, 'listCommunityFeed');
  return new SuccessResponse({
    data,
    page: page + 1,
    count: totalCount,
    nextPage: data.length === limit ? page + 2 : undefined,
    communityId: params.communityId,
  }).send(res);
};

export const getCommunityDetails = async (req: Request, res: Response, next: NextFunction) => {
  const community = await communityService.findCommunityByNameOrSlug(req.params.communityName as string);

  if (!community) throw new NotFoundError('Community not found');

  const engagements = await communityService.getCommunityEngagementSignals(community.id);
  const verifiedEngagements = await communityService.getCommunityRadarEngagementSignal(community.id);

  // todo: update api return type in web app
  return new SuccessResponse({ community, engagements, verifiedEngagements }).send(res);
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

  let data = await Promise.all(nodes.map(resolveLatestNode));

  /**
   * Sort based on engagment metrics/signal (nodes with higher metrics should come first)
   * or
   * fallback to last submission/attestation claim date
   */
  data = data
    .sort((entryA, entryB) => {
      const key1 = entryA.engagements.verifications + entryA.engagements.annotations + entryA.engagements.reactions;
      const key2 = entryB.engagements.verifications + entryB.engagements.annotations + entryB.engagements.reactions;
      if (key1 !== key2) return key2 - key1;

      const entryALastClaimedAt = new Date(
        entryA.NodeAttestation[entryA.NodeAttestation.length - 1].claimedAt,
      ).getTime();
      const entryBlastClaimedAt = new Date(
        entryB.NodeAttestation[entryB.NodeAttestation.length - 1].claimedAt,
      ).getTime();
      return entryBlastClaimedAt - entryALastClaimedAt;
    })
    .reverse();

  return new SuccessResponse(data).send(res);
};
