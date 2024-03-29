import { NextFunction, Request, Response } from 'express';
// import { Attestation, NodeAttestation } from '@prisma/client';
import _ from 'lodash';

import {
  BadRequestError,
  ForbiddenError,
  NotFoundError,
  SuccessMessageResponse,
  SuccessResponse,
  attestationService,
} from '../../internal.js';
import { logger as parentLogger } from '../../logger.js';

type RemoveVerificationBody = {
  verificationId: string;
};

type RemoveVerificationResponse = {
  ok: boolean;
  error?: string;
};

export const removeVerification = async (
  req: Request<RemoveVerificationBody, any, any>,
  res: Response<RemoveVerificationResponse>,
) => {
  const { verificationId } = req.params;
  const user = (req as any).user;

  const logger = parentLogger.child({
    module: 'ATTESTATIONS::removeVerification',
    user: (req as any).user.id,
    params: req.params,
  });
  logger.trace(`removeVerification`);
  // if (!claimId) throw new BadRequestError('Claim ID is required');

  const verification = await attestationService.findVerificationById(parseInt(verificationId));
  if (verification.userId !== user.id) {
    throw new ForbiddenError();
  }

  if (!verification) {
    return new SuccessMessageResponse().send(res);
  } else {
    await attestationService.removeVerification(verification.id, user.id);
    return new SuccessMessageResponse().send(res);
  }
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
    const author = _.pick(verification.user, ['id', 'name', 'orcid']);
    return { ...verification, authorId: verification.userId, userId: undefined, user: undefined, author };
  });

  return new SuccessResponse(data).send(res);
};
