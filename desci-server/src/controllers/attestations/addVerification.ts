import { Attestation, NodeAttestation } from '@prisma/client';
import { Request, Response } from 'express';

import { attestationService } from '../../internal.js';
import { logger as parentLogger } from '../../logger.js';

type AddVerificationRequestBody = {
  claimId: string;
};

type AddVerificationResponse = {
  ok: boolean;
  error?: string;
};

export const addVerification = async (
  req: Request<any, any, AddVerificationRequestBody>,
  res: Response<AddVerificationResponse>,
) => {
  const { claimId } = req.body;
  const user = (req as any).user;

  const logger = parentLogger.child({
    // id: req.id,
    module: 'ATTESTATIONS::addVerification',
    user: (req as any).user,
    body: req.body,
  });
  logger.trace(`addVerification`);
  if (!claimId) return res.status(400).send({ ok: false, error: 'Claim ID is required' });

  try {
    const newVerification = await attestationService.verifyClaim(parseInt(claimId), user.id);

    return res.status(200).send({ ok: true });
  } catch (e) {
    logger.error(e);
    return res.status(400).send({ ok: false, error: 'Failed to add reaction' });
  }
};
