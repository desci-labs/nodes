import { AttestationVersion, DesciCommunity, NodeAttestation } from '@prisma/client';
import { Request, Response } from 'express';

import { BadRequestErrorError, SuccessResponse, attestationService } from '../../internal.js';
import { logger as parentLogger } from '../../logger.js';

export type NodeAttestationFragment = NodeAttestation & {
  community: Pick<DesciCommunity, 'name' | 'description' | 'keywords'>;
  attestationVersion: Pick<AttestationVersion, 'name' | 'description' | 'image_url'>;
  engagments: {
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
  req: Request<{ dpid: string }>,
  res: Response<ShowNodeAttestationsResponse>,
) => {
  const { dpid } = req.params;

  const logger = parentLogger.child({
    module: 'ATTESTATIONS::showNodeAttestationsController',
    user: (req as any).user,
    dpid,
  });
  logger.trace(`showNodeAttestations`);

  if (!dpid) throw new BadRequestErrorError('DPID is required');

  let attestations = await attestationService.getAllNodeAttestations(dpid);
  attestations = attestations.map((att) => ({
    ...att,
    _count: undefined,
    engagments: {
      annotations: att._count.Annotation,
      reactions: att._count.NodeAttestationReaction,
      verifications: att._count.NodeAttestationVerification,
    },
  }));
  return new SuccessResponse(attestations).send(res);
};
