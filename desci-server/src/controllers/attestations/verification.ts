import { ActionType } from '@prisma/client';
import { NextFunction, Request, Response } from 'express';
// import { Attestation, NodeAttestation } from '@prisma/client';
import _ from 'lodash';

import {
  ForbiddenError,
  SuccessMessageResponse,
  SuccessResponse,
  attestationService,
  ensureUuidEndsWithDot,
  prisma,
} from '../../internal.js';
import { logger as parentLogger } from '../../logger.js';
import { saveInteraction, saveInteractionWithoutReq } from '../../services/interactionLog.js';
import orcidApiService from '../../services/orcid.js';

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
    new SuccessMessageResponse().send(res);
  } else {
    await attestationService.removeVerification(verification.id, user.id);
    await saveInteraction(req, ActionType.UNVERIFY_ATTESTATION, {
      claimId: verification.nodeAttestationId,
      userId: user.id,
    });
    new SuccessMessageResponse().send(res);

    const claim = await attestationService.findClaimById(verification.nodeAttestationId);
    const attestation = await attestationService.findAttestationById(claim.attestationId);

    if (attestation.protected) {
      /**
       * Update ORCID Profile
       */
      const node = await prisma.node.findFirst({ where: { uuid: ensureUuidEndsWithDot(claim.nodeUuid) } });
      const owner = await prisma.user.findFirst({ where: { id: node.ownerId } });
      if (owner.orcid)
        await orcidApiService.removeClaimRecord({ claimId: claim.id, nodeUuid: node.uuid, orcid: owner.orcid });
    }
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

  const claim = await attestationService.findClaimById(parseInt(claimId));

  await attestationService.verifyClaim(parseInt(claimId), user.id);
  await saveInteraction(req, ActionType.VERIFY_ATTESTATION, { claimId: claimId, userId: user.id });

  const attestation = await attestationService.findAttestationById(claim.attestationId);

  new SuccessMessageResponse().send(res);

  if (attestation.protected) {
    /**
     * Update ORCID Profile
     */
    const node = await prisma.node.findFirst({ where: { uuid: ensureUuidEndsWithDot(claim.nodeUuid) } });
    const owner = await prisma.user.findFirst({ where: { id: node.ownerId } });
    if (owner.orcid) await orcidApiService.postWorkRecord(node.uuid, owner.orcid);
    await saveInteractionWithoutReq(ActionType.UPDATE_ORCID_RECORD, {
      ownerId: owner.id,
      orcid: owner.orcid,
      uuid: node.uuid,
      claimId,
    });
  }
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
