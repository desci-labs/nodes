import { AttestationVersion, DesciCommunity, NodeAttestation } from '@prisma/client';
import { Request, Response } from 'express';

// import { BadRequestError, SuccessResponse, attestationService } from '../../internal.js';
import { logger as parentLogger } from '../../logger.js';

export type NodeAttestationFragment = NodeAttestation & {
  community: Pick<DesciCommunity, 'name' | 'description' | 'keywords'>;
  attestationVersion: Pick<AttestationVersion, 'name' | 'description' | 'image_url'>;
  engagements: {
    reactions: number;
    verifications: number;
    annotations: number;
  };
};

type ShowNodeAttestationsResponse = {
  ok: boolean;
  attestations?: NodeAttestationFragment[];
  error?: string;
};

export const showNodeAttestations = async (
  req: Request<{ uuid: string }>,
  res: Response<ShowNodeAttestationsResponse>,
) => {
  const { uuid } = req.params;

  const logger = parentLogger.child({
    module: 'ATTESTATIONS::showNodeAttestationsController',
    user: (req as any).user,
    uuid,
  });
  logger.trace(`showNodeAttestations`);

  if (!uuid) throw new BadRequestError('uuid is required');

  let attestations = await attestationService.getAllNodeAttestations(uuid);
  attestations = attestations.map((att) => ({
    ...att,
    _count: undefined,
    node: undefined,
    selfAssigned: att.claimedById === att.node.ownerId,
    engagements: {
      annotations: att._count.Annotation,
      reactions: att._count.NodeAttestationReaction,
      verifications: att._count.NodeAttestationVerification,
    },
  }));
  return new SuccessResponse(attestations).send(res);
};

export const showCommunityClaims = async (
  req: Request<{ dpid: string; communityId: string }>,
  res: Response<ShowNodeAttestationsResponse>,
) => {
  const { dpid, communityId } = req.params;

  const logger = parentLogger.child({
    module: 'ATTESTATIONS::showCommunityClaims',
    user: (req as any).user,
    dpid,
  });
  logger.trace(`showNodeAttestations`);

  if (!dpid) throw new BadRequestError('DPID is required');

  let attestations = await attestationService.getNodeCommunityAttestations(dpid, parseInt(communityId));
  attestations = attestations.map((att) => ({
    ...att,
    _count: undefined,
    node: undefined,
    selfAssigned: att.claimedById === att.node.ownerId,
    engagements: {
      annotations: att._count.Annotation,
      reactions: att._count.NodeAttestationReaction,
      verifications: att._count.NodeAttestationVerification,
    },
  }));
  return new SuccessResponse(attestations).send(res);
};
