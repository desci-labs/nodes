import { Attestation, NodeAttestation } from '@prisma/client';
import { Request, Response } from 'express';

import { BadRequestErrorError, BadRequestResponse, SuccessResponse, attestationService } from '../../internal.js';
import { logger as parentLogger } from '../../logger.js';

type AttestationFragment = NodeAttestation & {
  attestation: Attestation;
};

type ShowNodeAttestationsResponse = {
  ok: boolean;
  attestations?: AttestationFragment[];
  error?: string;
};

export const showNodeAttestations = async (
  req: Request<{ dpid: string }>,
  res: Response<ShowNodeAttestationsResponse>,
) => {
  const { dpid } = req.params;

  const logger = parentLogger.child({
    // id: req.id,
    module: 'ATTESTATIONS::showNodeAttestationsController',
    user: (req as any).user,
    dpid,
  });
  logger.trace(`showNodeAttestations`);

  if (!dpid) throw new BadRequestErrorError('DPID is required');

  const attestations = await attestationService.getAllNodeAttestations(dpid);
  return new SuccessResponse(attestations).send(res);
};
