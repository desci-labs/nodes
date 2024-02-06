import { Attestation, NodeAttestation } from '@prisma/client';
import { Request, Response } from 'express';

import { attestationService } from '../../internal.js';
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
  if (!dpid) return res.status(400).send({ ok: false, error: 'DPID is required' });

  try {
    const attestations = await attestationService.getAllNodeAttestations(dpid);

    return res.status(200).send({ ok: true, attestations });
  } catch (e) {
    logger.error(e);
    return res.status(400).send({ ok: false, error: 'Failed to retrieve attestations' });
  }
};
