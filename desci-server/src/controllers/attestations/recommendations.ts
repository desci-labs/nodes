import { NextFunction, Request, Response } from 'express';
import _ from 'lodash';
import z from 'zod';

import { NotFoundError } from '../../core/ApiError.js';
import { SuccessResponse } from '../../core/ApiResponse.js';
import { logger as parentLogger } from '../../logger.js';
import { searchAttestationsSchema } from '../../routes/v1/attestations/schema.js';
import { attestationService } from '../../services/Attestation.js';
import { communityService } from '../../services/Communities.js';

const logger = parentLogger.child({ module: 'Recommendations' });

export const getAllRecommendations = async (req: Request, res: Response, _next: NextFunction) => {
  const { query } = await searchAttestationsSchema.parseAsync(req);
  logger.trace({ query }, 'getAllRecommendations');
  const attestations = await attestationService.getRecommendedAttestations(
    query.search
      ? {
          where: {
            attestationVersion: {
              OR: [
                { name: { contains: query.search, mode: 'insensitive' } },
                { description: { contains: query.search, mode: 'insensitive' } },
              ],
            },
            desciCommunity: { hidden: false },
          },
        }
      : undefined,
  );
  const attestationEntries = _(attestations)
    .groupBy((x) => x.attestationId)
    .map((value, _) => ({
      attestationId: value[0].attestationId,
      attestationVersionId: value[0].attestationVersionId,
      required: value[0].required,
      createdAt: value[0].createdAt,
      name: value[0].attestationVersion.name,
      description: value[0].attestationVersion.description,
      image_url: value[0].attestationVersion.image_url,
      communities: value.map((entry) => ({
        communityId: entry.desciCommunityId,
        communityName: entry.desciCommunity.name,
        image_url: entry.desciCommunity.image_url,
      })),
    }))
    .value()
    .sort((entryA, entryB) => entryB.communities.length - entryA.communities.length);

  logger.info({ attestationEntries: attestationEntries.length }, 'getAllRecommendations');
  return new SuccessResponse(attestationEntries).send(res);
};

export const getCommunityRecommendations = async (req: Request, res: Response, _next: NextFunction) => {
  const { communityName } = req.params;
  logger.info({ communityName });
  const community = await communityService.findCommunityByNameOrSlug(communityName);
  if (!community) throw new NotFoundError('Community not found');
  logger.info({ community });

  let attestations = await attestationService.listCommunityEntryAttestations(community.id);
  attestations = attestations.sort((c1, c2) => {
    const key1 = c1.verifications + c1.annotations + c1.reactions;
    const key2 = c2.verifications + c2.annotations + c2.reactions;
    return key2 - key1;
  });
  // logger.info({ attestations });

  logger.info({ attestations: attestations.length, communityName }, 'GetCommunityRecommendations');
  return new SuccessResponse(attestations).send(res);
};

export const getValidatedAttestations = async (req: Request, res: Response, _next: NextFunction) => {
  const { communityName } = req.params;
  logger.info({ communityName });
  const community = await communityService.findCommunityByNameOrSlug(communityName);
  if (!community) throw new NotFoundError('Community not found');

  const attestations = await attestationService.getCommunityAttestations({
    communityId: community.id,
    protected: true,
  });
  const response = _.map(attestations, (attestation) => ({
    ...attestation,
    AttestationVersion: attestation.AttestationVersion[0],
  }));
  return new SuccessResponse(response).send(res);
};

export const getValidatedRecommendations = async (req: Request, res: Response, _next: NextFunction) => {
  const attestations = await attestationService.getProtectedAttestations({
    protected: true,
  });
  const response = _.map(attestations, (attestation) => ({
    ...attestation,
    community: undefined,
    communityName: attestation.community.name,
    AttestationVersion: attestation.AttestationVersion[0],
  }));
  logger.info({ recommendations: attestations.length }, 'getValidatedRecommendations');
  return new SuccessResponse(response).send(res);
};
