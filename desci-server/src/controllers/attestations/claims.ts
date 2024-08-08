import { ActionType, CommunityEntryAttestation, EmailType } from '@prisma/client';
import { NextFunction, Request, Response } from 'express';
import _ from 'lodash';

import {
  AuthFailureError,
  NotFoundError,
  SuccessMessageResponse,
  SuccessResponse,
  asyncMap,
  attestationService,
  ensureUuidEndsWithDot,
  logger,
  prisma,
} from '../../internal.js';
import { RequestWithUser } from '../../middleware/authorisation.js';
import { removeClaimSchema } from '../../routes/v1/attestations/schema.js';
import { saveInteraction } from '../../services/interactionLog.js';
import { AttestationClaimedEmailHtml } from '../../templates/emails/utils/emailRenderer.js';
import { getIndexedResearchObjects } from '../../theGraph.js';

export const claimAttestation = async (req: RequestWithUser, res: Response, _next: NextFunction) => {
  const body = req.body as {
    attestationId: number;
    nodeVersion: number;
    nodeUuid: string;
    nodeDpid: string;
    claimerId: number;
  };
  const attestationVersions = await attestationService.getAttestationVersions(body.attestationId);
  const latest = attestationVersions.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const attestationVersion = latest[0];
  logger.info({ body, latest, attestationVersion }, 'CLAIM');
  const uuid = ensureUuidEndsWithDot(body.nodeUuid);

  const claim = await attestationService.getClaimOnAttestationVersion(
    body.nodeDpid,
    body.attestationId,
    attestationVersion.id,
  );

  if (claim && claim.revoked) {
    const reclaimed = await attestationService.reClaimAttestation(claim.id);
    await saveInteraction(req, ActionType.CLAIM_ATTESTATION, { ...body, claimId: reclaimed.id });
    new SuccessResponse(reclaimed).send(res);
    return;
  }

  const nodeClaim = await attestationService.claimAttestation({
    ...body,
    nodeDpid: body.nodeDpid,
    nodeUuid: uuid,
    attestationVersion: attestationVersion.id,
  });

  await saveInteraction(req, ActionType.CLAIM_ATTESTATION, { ...body, claimId: nodeClaim.id });

  // notifiy community members if attestation is protected
  // new attestations should be trigger notification of org members if protected
  const attestation = await attestationService.findAttestationById(body.attestationId);
  logger.info({ nodeClaim, attestation }, 'CLAIMED');

  new SuccessResponse(nodeClaim).send(res);

  // Check if published to defer emails if not
  const indexed = await getIndexedResearchObjects([uuid]);
  const isNodePublished = !!indexed?.length;

  if (!isNodePublished && attestation.protected) {
    // Email table append op
    const deferredEmail = await prisma.deferredEmails.create({
      data: {
        nodeUuid: uuid,
        emailType: EmailType.PROTECTED_ATTESTATION,
        nodeAttestationId: nodeClaim.id,
        attestationVersionId: attestationVersion.id,
        userId: req.user.id,
      },
    });
    logger.info({ deferredEmail }, 'Attestation was claimed on an unpublished node, deferred email table entry added.');
  }

  if (attestation.protected && isNodePublished) {
    await attestationService.emailProtectedAttestationCommunityMembers(
      nodeClaim.id,
      attestationVersion.id,
      body.nodeVersion,
      body.nodeDpid,
      req.user,
    );
  }

  return;
};

export const removeClaim = async (req: RequestWithUser, res: Response, _next: NextFunction) => {
  const { body } = await removeClaimSchema.parseAsync(req);

  const node = await prisma.node.findFirst({ where: { uuid: body.nodeUuid } });
  if (!node) throw new NotFoundError('Node not found');

  const claim = await attestationService.getClaimOnUuid(body.claimId, body.nodeUuid);
  if (!claim) throw new NotFoundError();

  if (node.ownerId !== req.user.id || claim.claimedById !== req.user.id) throw new AuthFailureError();

  const claimSignal = await attestationService.getClaimEngagementSignals(claim.id);
  const totalSignal = claimSignal.annotations + claimSignal.reactions + claimSignal.verifications;
  const removeOrRevoke =
    totalSignal > 0
      ? await attestationService.revokeAttestation(claim.id)
      : await attestationService.unClaimAttestation(claim.id);

  await saveInteraction(req, ActionType.REVOKE_CLAIM, body);

  // Check if any deferredEmails are created for attestation being unclaimed
  try {
    const deferredEmails = await prisma.deferredEmails.findMany({
      where: {
        nodeUuid: ensureUuidEndsWithDot(body.nodeUuid),
        emailType: EmailType.PROTECTED_ATTESTATION,
        nodeAttestationId: claim.id,
        userId: req.user.id,
      },
    });
    if (deferredEmails.length) {
      const deleteIds = deferredEmails.map((e) => e.id);
      const deleted = await prisma.deferredEmails.deleteMany({ where: { id: { in: deleteIds } } });
      logger.info({ deleted }, 'Deferred attestation claim emails deleted');
    }
  } catch (e) {
    logger.warn({ e, message: e?.message }, 'Something went wrong with deleting deferred attestation claim emails');
  }

  logger.info({ removeOrRevoke, totalSignal, claimSignal }, 'Claim Removed|Revoked');
  return new SuccessMessageResponse('Attestation unclaimed').send(res);
};

export const claimEntryRequirements = async (req: Request, res: Response, _next: NextFunction) => {
  const { communityId, nodeDpid, nodeUuid, nodeVersion, claimerId } = req.body as {
    communityId: number;
    nodeVersion: number;
    nodeUuid: string;
    nodeDpid: string;
    claimerId: number;
  };
  logger.info({ communityId, body: req.body }, 'claimEntryRequirements');
  const uuid = ensureUuidEndsWithDot(nodeUuid);

  const entryAttestations = await attestationService.getAllCommunityEntryAttestations(communityId);
  logger.info({ entryAttestations });

  const claimables = (await asyncMap(entryAttestations, async (attestation) => {
    const claimable = await attestationService.canClaimAttestation({
      nodeDpid,
      claimerId,
      nodeVersion,
      nodeUuid: uuid,
      attestationId: attestation.attestationId,
      attestationVersion: attestation.attestationVersionId,
    });

    const previousClaim = await attestationService.getClaimOnAttestationVersion(
      nodeDpid,
      attestation.attestationId,
      attestation.attestationVersionId,
    );

    return { ...attestation, claimable: claimable && (!previousClaim || previousClaim.revoked) };
  })) as (CommunityEntryAttestation & { claimable: boolean })[];
  logger.info({ claimables, communityId });

  const claims = claimables
    .filter((entry) => entry.claimable === true)
    .map((claimable) => ({
      attestationId: claimable.attestationId,
      attestationVersion: claimable.attestationVersionId,
    }));

  logger.info({ claims }, 'CLAIM all input');
  const attestations = await attestationService.claimAttestations({
    nodeDpid,
    claimerId,
    nodeVersion,
    nodeUuid: uuid,
    attestations: claims,
  });

  await saveInteraction(req, ActionType.CLAIM_ENTRY_ATTESTATIONS, {
    communityId,
    nodeDpid,
    claimerId,
    claims: attestations.map((att) => att.id),
  });

  return new SuccessResponse(attestations).send(res);
};
