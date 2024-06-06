import { CommunityEntryAttestation } from '@prisma/client';
import sgMail from '@sendgrid/mail';
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
import { AttestationClaimedEmailHtml } from '../../templates/emails/utils/emailRenderer.js';

sgMail.setApiKey(process.env.SENDGRID_API_KEY);

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
    new SuccessResponse(reclaimed).send(res);
    return;
  }

  const nodeClaim = await attestationService.claimAttestation({
    ...body,
    nodeDpid: body.nodeDpid,
    nodeUuid: uuid,
    attestationVersion: attestationVersion.id,
  });

  // notifiy community members if attestation is protected
  // new attestations should be trigger notification of org members if protected
  const attestation = await attestationService.findAttestationById(body.attestationId);
  logger.info({ nodeClaim, attestation }, 'CLAIMED');

  new SuccessResponse(nodeClaim).send(res);

  if (attestation.protected) {
    const members = await prisma.communityMember.findMany({
      where: { communityId: attestation.communityId },
      include: { user: { select: { email: true } } },
    });

    const messages = members.map((member) => ({
      to: member.user.email,
      from: 'no-reply@desci.com',
      subject: `[nodes.desci.com] ${attestationVersion.name} claimed on DPID://${body.nodeDpid}/v${body.nodeVersion + 1}`,
      text: `${req.user.name} just claimed ${attestationVersion.name} on ${process.env.DAPP_URL}/dpid/${body.nodeDpid}/v${body.nodeVersion + 1}?claim=${nodeClaim.id}`,
      html: AttestationClaimedEmailHtml({
        dpid: body.nodeDpid,
        attestationName: attestationVersion.name,
        communityName: attestationVersion.name,
        userName: req.user.name,
        dpidPath: `${process.env.DAPP_URL}/dpid/${body.nodeDpid}/v${body.nodeVersion + 1}?claim=${nodeClaim.id}`,
      }),
    }));

    try {
      logger.info({ members: messages, NODE_ENV: process.env.NODE_ENV }, '[EMAIL]:: ATTESTATION EMAIL');
      if (process.env.NODE_ENV === 'production') {
        const response = await sgMail.send(messages);
        logger.info(response, '[EMAIL]:: Response');
      } else {
        messages.forEach((message) => logger.info({ nodeEnv: process.env.NODE_ENV }, message.subject));
      }
    } catch (err) {
      logger.info({ err }, '[EMAIL]::ERROR');
    }
  }

  return;
};

export const removeClaim = async (req: RequestWithUser, res: Response, _next: NextFunction) => {
  const { body } = await removeClaimSchema.parseAsync(req);

  const node = await prisma.node.findFirst({ where: { uuid: body.nodeUuid } });
  if (!node) throw new NotFoundError('Node not found');

  const claim = await attestationService.getClaimOnDpid(body.claimId, body.dpid.toString());
  if (!claim) throw new NotFoundError();

  if (node.ownerId !== req.user.id || claim.claimedById !== req.user.id) throw new AuthFailureError();

  const claimSignal = await attestationService.getClaimEngagementSignals(claim.id);
  const totalSignal = claimSignal.annotations + claimSignal.reactions + claimSignal.verifications;
  const removeOrRevoke =
    totalSignal > 0
      ? await attestationService.revokeAttestation(claim.id)
      : await attestationService.unClaimAttestation(claim.id);

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

  const entryAttestations = await attestationService.getCommunityEntryAttestations(communityId);
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

  return new SuccessResponse(attestations).send(res);
};
