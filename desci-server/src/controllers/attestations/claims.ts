import { CommunitySelectedAttestation } from '@prisma/client';
import { NextFunction, Request, Response } from 'express';
import _ from 'lodash';

import {
  AuthFailiureError,
  NotFoundError,
  SuccessMessageResponse,
  SuccessResponse,
  asyncMap,
  attestationService,
  logger,
  prisma,
} from '../../internal.js';
import { RequestWithUser } from '../../middleware/authorisation.js';

export const claimAttestation = async (req: RequestWithUser, res: Response, _next: NextFunction) => {
  const body = req.body as {
    attestationId: number;
    attestationVersion: number;
    nodeVersion: number;
    nodeUuid: string;
    nodeDpid: string;
    claimerId: number;
  };
  const attestations = await attestationService.claimAttestation(body);

  return new SuccessResponse(attestations).send(res);
};

export const removeClaim = async (req: RequestWithUser, res: Response, _next: NextFunction) => {
  const body = req.body as {
    attestationId: number;
    attestationVersion: number;
    dpid: string;
    nodeUuid: string;
    claimerId: number;
  };

  const node = await prisma.node.findFirst({ where: { uuid: body.nodeUuid } });
  if (!node) throw new NotFoundError('Node not found');
  if (node.ownerId !== req.user.id || body.claimerId !== req.user.id) throw new AuthFailiureError();

  const claim = await attestationService.getClaimOnAttestationVersion(
    body.dpid,
    body.attestationId,
    body.attestationVersion,
  );

  if (!claim) throw new NotFoundError();

  await attestationService.unClaimAttestation(claim.id);

  return new SuccessMessageResponse('Attestation unclaimed').send(res);
};

export const claimEntryRequirements = async (req: Request, res: Response, _next: NextFunction) => {
  const { communityId } = req.params;
  const { nodeDpid, nodeUuid, nodeVersion, claimerId } = req.body as {
    communityId: number;
    nodeVersion: number;
    nodeUuid: string;
    nodeDpid: string;
    claimerId: number;
  };
  logger.info({ communityId, body: req.body });

  const entryAttestations = await attestationService.getCommunityEntryAttestations(parseInt(communityId));

  const claimables = (await asyncMap(entryAttestations, async (attestation) => {
    const claimable = await attestationService.canClaimAttestation({
      attestationId: attestation.attestationId,
      attestationVersion: attestation.attestationVersionId,
      nodeVersion,
      nodeUuid,
      nodeDpid,
      claimerId,
    });
    return { ...attestation, claimable };
  })) as (CommunitySelectedAttestation & { claimable: boolean })[];
  logger.info({ claimables, communityId });
  console.log({ claimables });

  const claims = claimables
    .filter((entry) => entry.claimable === true)
    .map((claimable) => ({
      attestationId: claimable.attestationId,
      attestationVersion: claimable.attestationVersionId,
    }));

  console.log({ claims });
  logger.info({ claims }, 'CLAIM all input');
  const attestations = await attestationService.claimAttestations({
    nodeVersion,
    nodeUuid,
    nodeDpid: nodeDpid.toString(),
    claimerId,
    attestations: claims,
  });

  return new SuccessResponse(attestations).send(res);
};