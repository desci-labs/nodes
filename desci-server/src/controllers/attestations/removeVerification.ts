import { Request, Response } from 'express';

import { prisma } from '../../client.js';
import { attestationService } from '../../internal.js';
import { logger as parentLogger } from '../../logger.js';

type RemoveVerificationBody = {
  claimId: string;
};

type RemoveVerificationResponse = {
  ok: boolean;
  error?: string;
};

export const removeVerification = async (
  req: Request<any, any, RemoveVerificationBody>,
  res: Response<RemoveVerificationResponse>,
) => {
  const { claimId } = req.body;
  const user = (req as any).user;

  const logger = parentLogger.child({
    // id: req.id,
    module: 'ATTESTATIONS::removeVerification',
    user: (req as any).user,
    body: req.body,
  });
  logger.trace(`removeVerification`);
  if (!claimId) return res.status(400).send({ ok: false, error: 'Claim ID is required' });

  try {
    const verification = await prisma.nodeAttestationVerification.findFirst({
      where: { userId: user.id, nodeAttestationId: parseInt(claimId) },
    });
    if (!verification) return res.status(404).send({ ok: false, error: 'Verification not found' });
    const removed = await attestationService.removeVerification(verification.id, user.id);

    return res.status(200).send({ ok: true });
  } catch (e) {
    logger.error(e);
    return res.status(400).send({ ok: false, error: 'Failed to remove verification' });
  }
};
