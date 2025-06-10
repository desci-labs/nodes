import { ActionType, Prisma, User } from '@prisma/client';
import { NextFunction, Request, Response } from 'express';
// import { Attestation, NodeAttestation } from '@prisma/client';
import _ from 'lodash';

import { prisma } from '../../client.js';
import { ForbiddenError } from '../../core/ApiError.js';
import { SuccessMessageResponse, SuccessResponse } from '../../core/ApiResponse.js';
import { logger as parentLogger } from '../../logger.js';
import { delFromCache } from '../../redisClient.js';
import { attestationService } from '../../services/Attestation.js';
import { getTargetDpidUrl } from '../../services/fixDpid.js';
import { doiService } from '../../services/index.js';
import { saveInteraction, saveInteractionWithoutReq } from '../../services/interactionLog.js';
import { NotificationService } from '../../services/Notifications/NotificationService.js';
import orcidApiService from '../../services/orcid.js';
import { DiscordChannel, discordNotify, DiscordNotifyType } from '../../utils/discordUtils.js';
import { ensureUuidEndsWithDot } from '../../utils.js';

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

    await saveInteraction({
      req,
      action: ActionType.UNVERIFY_ATTESTATION,
      data: { claimId: verification.nodeAttestationId, userId: user.id },
    });

    new SuccessMessageResponse().send(res);

    const claim = await attestationService.findClaimById(verification.nodeAttestationId);
    const attestation = await attestationService.findAttestationById(claim.attestationId);

    // invalidate radar and curated feed count cache
    await delFromCache(`radar-${claim.desciCommunityId}-count`);
    await delFromCache(`curated-${claim.desciCommunityId}-count`);
    await delFromCache(`all-communities-curated-count`);

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
  await saveInteraction({
    req,
    action: ActionType.VERIFY_ATTESTATION,
    data: { claimId: claimId, userId: user.id },
  });

  new SuccessMessageResponse().send(res);

  // invalidate radar and curated feed count cache
  await delFromCache(`radar-${claim.desciCommunityId}-count`);
  await delFromCache(`curated-${claim.desciCommunityId}-count`);
  await delFromCache(`all-communities-curated-count`);

  const attestation = await attestationService.findAttestationById(claim.attestationId);
  if (attestation.protected) {
    /**
     * Update ORCID Profile
     */
    const node = await prisma.node.findFirst({
      where: { uuid: ensureUuidEndsWithDot(claim.nodeUuid) },
      include: { owner: { select: { id: true, orcid: true } } },
    });

    const owner = node.owner as User; // await prisma.user.findFirst({ where: { id: node.ownerId } });
    if (owner.orcid) await orcidApiService.postWorkRecord(node.uuid, owner.orcid, node.dpidAlias.toString());
    await saveInteractionWithoutReq({
      action: ActionType.UPDATE_ORCID_RECORD,
      data: {
        ownerId: owner.id,
        orcid: owner.orcid,
        uuid: node.uuid,
        claimId,
      },
    });

    if (attestation.canMintDoi) {
      // trigger doi minting workflow
      try {
        const submission = await doiService.autoMintTrigger(node.uuid);
        const targetDpidUrl = getTargetDpidUrl();
        discordNotify({
          channel: DiscordChannel.DoiMinting,
          type: DiscordNotifyType.INFO,
          title: 'Mint DOI',
          message: `${targetDpidUrl}/${submission.dpid} sent a request to mint: ${submission.uniqueDoi}`,
        });
      } catch (err) {
        logger.error({ err }, 'Error:  Mint DOI on Publish');
      }
    }

    /**
     * Fire off notification
     */
    await NotificationService.emitOnAttestationValidation({ node, user: owner, claimId: parseInt(claimId) });
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
