import { NextFunction, Request, Response } from 'express';
// import { Attestation, NodeAttestation } from '@prisma/client';
import _ from 'lodash';

import {
  BadRequestError,
  NotFoundError,
  SuccessMessageResponse,
  SuccessResponse,
  attestationService,
} from '../../internal.js';
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
    module: 'ATTESTATIONS::removeVerification',
    user: (req as any).user,
    body: req.body,
  });
  logger.trace(`removeVerification`);
  if (!claimId) throw new BadRequestError('Claim ID is required');

  const verification = await attestationService.getUserClaimVerification(parseInt(claimId), user.id);
  if (!verification) throw new NotFoundError('Verification not found');
  await attestationService.removeVerification(verification.id, user.id);
  return new SuccessMessageResponse('Verification removed').send(res);
};

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

  if (!claimId) throw new BadRequestError('Claim ID is required');

  await attestationService.verifyClaim(parseInt(claimId), user.id);
  return new SuccessMessageResponse().send(res);
};

export const getAttestationVerifications = async (req: Request, res: Response, next: NextFunction) => {
  const logger = parentLogger.child({
    module: 'ATTESTATIONS::getAttestationVerifications',
  });
  logger.trace({
    user: (req as any).user,
    body: req.body,
  });

  const { claimId } = req.params;
  const verifications = await attestationService.getAllClaimVerfications(parseInt(claimId));

  const data = verifications.map((verification) => {
    const author = _.pick(verification.user, ['name', 'orcid']);
    return { ...verification, authorId: verification.userId, userId: undefined, author };
  });

  return new SuccessResponse(data).send(res);
};
