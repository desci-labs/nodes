import { NextFunction, Request, Response } from 'express';
import _ from 'lodash';

import {
  NotFoundError,
  SuccessResponse,
  attestationService,
  communityService,
  logger as parentLogger,
} from '../../internal.js';

const logger = parentLogger.child({ module: 'Recommendations' });

export const getAllRecommendations = async (_req: Request, res: Response, _next: NextFunction) => {
  const attestations = await attestationService.getRecommendedAttestations();
  const communityEntries = _(attestations)
    .groupBy((x) => x.desciCommunityId)
    .map((value, key) => ({
      community: value[0].desciCommunity.name,
      communityId: key,
      attestations: value.map((attestation) => ({
        id: attestation.id,
        communityId: value[0].attestation.community.id,
        communityName: value[0].attestation.community.name,
        attestationId: attestation.attestationId,
        attestationVersionId: attestation.attestationVersionId,
        required: attestation.required,
        createdAt: attestation.createdAt,
        name: attestation.attestationVersion.name,
        description: attestation.attestationVersion.description,
        image_url: attestation.attestationVersion.image_url,
      })),
    }))
    .value();

  return new SuccessResponse(communityEntries).send(res);
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
  logger.info({ attestations });

  logger.info({ attestations: attestations.length, communityName }, 'GetCommunityRecommendations');
  return new SuccessResponse(attestations).send(res);
};

export const getValidatedAttestations = async (req: Request, res: Response, _next: NextFunction) => {
  const { communityName } = req.params;
  logger.info({ communityName });
  const community = await communityService.findCommunityByNameOrSlug(communityName);
  if (!community) throw new NotFoundError('Community not found');
  logger.info({ community });

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
  logger.info({ attestations }, 'getValidatedRecommendations');
  return new SuccessResponse(response).send(res);
};
