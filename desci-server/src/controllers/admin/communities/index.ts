import { CommunityMembershipRole } from '@prisma/client';
import { NextFunction, Request, Response } from 'express';
import _ from 'lodash';
import { z } from 'zod';

import { prisma } from '../../../client.js';
import { BadRequestError, NotFoundError } from '../../../core/ApiError.js';
import { SuccessMessageResponse, SuccessResponse } from '../../../core/ApiResponse.js';
import { DuplicateDataError } from '../../../core/communities/error.js';
import { logger as parentLogger } from '../../../logger.js';
import {
  addAttestationSchema,
  addCommunitySchema,
  addEntryAttestationSchema,
  addMemberSchema,
  removeMemberSchema,
  toggleEntryAttestationSchema,
  updateAttestationSchema,
  updateCommunitySchema,
} from '../../../routes/v1/admin/communities/schema.js';
import { attestationService } from '../../../services/Attestation.js';
import { communityService } from '../../../services/Communities.js';
import { processUploadToIpfs } from '../../../services/data/processing.js';
import { asyncMap } from '../../../utils.js';

const logger = parentLogger.child({ module: 'Admin/Communities/controller' });

export const todoApi = async (_req: Request, res: Response, next: NextFunction) => {
  new SuccessMessageResponse().send(res);
};

export const createCommunity = async (req: Request, res: Response, _next: NextFunction) => {
  const body = req.body as Required<z.infer<typeof addCommunitySchema>['body']>;

  const exists = await communityService.findCommunityByNameOrSlug(body.slug);
  if (exists) throw new DuplicateDataError();

  let assets: { key: string; url: string }[];
  let uploads = Array.isArray(req.files)
    ? req.files
    : Object.values(req.files)
        .map((files) => files[0])
        .filter(Boolean);

  if (uploads?.length > 0) {
    uploads = uploads.map((file) => {
      file.originalname = `${file.fieldname}.${file.originalname.split('.')?.[1]}`;
      return file;
    });
    logger.info({ uploads }, 'Uploads');
    const { ok, value } = await processUploadToIpfs({ files: uploads });
    if (ok && value) {
      assets = value.map((ipfsImg) => ({
        key: ipfsImg.path,
        url: `${process.env.IPFS_RESOLVER_OVERRIDE}/${ipfsImg.cid}`,
      }));
    } else {
      throw new BadRequestError('Could not upload file to ipfs');
    }
  }

  const image_url = assets?.find((img) => img.key.toLowerCase().includes('image'))?.url || body.imageUrl;
  delete body.imageUrl;

  if (!image_url) throw new BadRequestError('No community logo uploaded');

  const hidden = body.hidden.toString() === 'true' ? true : false;
  const community = await communityService.createCommunity({ ...body, hidden, image_url });
  new SuccessResponse(community).send(res);
};

export const updateCommunity = async (req: Request, res: Response, _next: NextFunction) => {
  const body = req.body as Required<z.infer<typeof updateCommunitySchema>['body']>;
  const { communityId } = req.params as z.infer<typeof updateCommunitySchema>['params'];
  logger.info({ body, communityId }, 'updateCommunity');

  let community = await communityService.findCommunityById(+communityId);

  if (!community) throw new NotFoundError();

  let assets: { key: string; url: string }[];
  let uploads = Array.isArray(req.files)
    ? req.files
    : Object.values(req.files)
        ?.map((files) => files[0])
        .filter(Boolean);

  logger.info({ uploads: !!uploads }, 'Uploads');
  if (uploads?.length > 0) {
    uploads = uploads.map((file) => {
      file.originalname = `${file.fieldname}.${file.originalname.split('.')?.[1]}`;
      return file;
    });
    const { ok, value } = await processUploadToIpfs({ files: uploads });
    if (ok && value) {
      assets = value.map((ipfsImg) => ({
        key: ipfsImg.path,
        url: `${process.env.IPFS_RESOLVER_OVERRIDE}/${ipfsImg.cid}`,
      }));
    } else {
      throw new BadRequestError('Could not upload file to ipfs');
    }
  }

  // enforce strict non-empty check on image_url field
  const image_url =
    assets?.find((img) => img.key.toLowerCase().includes('image'))?.url || body?.imageUrl || community.image_url;
  delete body.imageUrl;

  if (!image_url) throw new BadRequestError('No community logo uploaded');
  const hidden = body.hidden.toString() === 'true' ? true : false;

  community = await communityService.updateCommunityById(+communityId, { ...body, hidden, image_url });
  new SuccessResponse(community).send(res);
};

export const listAllCommunities = async (_req: Request, res: Response, _next: NextFunction) => {
  const communities = await communityService.adminGetCommunities();
  logger.trace('List communities');
  const data = await asyncMap(communities, async (community) => {
    const engagements = await communityService.getCommunityEngagementSignals(community.id);
    const verifiedEngagements = await communityService.getCommunityRadarEngagementSignal(community.id);
    return {
      ...community,
      engagements,
      verifiedEngagements,
    };
  });
  new SuccessResponse(data).send(res);
};

export const listAttestations = async (_req: Request, res: Response, _next: NextFunction) => {
  const attestations = await communityService.adminGetAttestations();
  const data = attestations.map((attestation) => ({
    ...attestation,
    name: attestation.AttestationVersion[0].name,
    image_url: attestation.AttestationVersion[0].image_url,
    description: attestation.AttestationVersion[0].description,
  }));
  // logger.info({ attestations }, 'List attestations');
  new SuccessResponse(data).send(res);
};

export const listCommunityAttestations = async (
  req: Request<{ communityId: string }>,
  res: Response,
  _next: NextFunction,
) => {
  const { communityId } = req.params;
  const attestations = await communityService.adminGetAttestations({ communityId: parseInt(communityId) });
  // throw new BadRequestError('bad request');
  const entryAttestations = await communityService.getEntryAttestations({ desciCommunityId: parseInt(communityId) });
  const data = attestations
    .filter((entry) => !entryAttestations.find((attestation) => attestation.attestationId === entry.id))
    .map((attestation) => ({
      id: attestation.id,
      attestationId: attestation.id,
      communityId: attestation.communityId,
      name: attestation.name,
      imageUrl: attestation.AttestationVersion[attestation.AttestationVersion.length - 1].image_url,
      description: attestation.description,
      protected: attestation.protected,
      isRequired: !!attestation.CommunityEntryAttestation.length,
      isExternal: false,
      communityName: attestation.community.name,
    }));

  const entryData = entryAttestations.map((entry) => ({
    id: entry.attestationId,
    attestationId: entry.attestationId,
    communityId: entry.desciCommunityId,
    name: entry.attestationVersion.name,
    imageUrl: entry.attestationVersion.image_url,
    description: entry.attestationVersion.description,
    protected: entry.attestation.protected,
    isRequired: entry.required,
    entryAttestationId: entry.id,
    isExternal: entry.desciCommunityId !== parseInt(communityId),
    communityName: entry.attestation.community.name,
  }));

  // logger.info({ attestations }, 'List attestations');
  new SuccessResponse(data.concat(entryData)).send(res);
};

export const listCommunityEntryAttestations = async (
  req: Request<{ communityId: string }>,
  res: Response,
  _next: NextFunction,
) => {
  const { communityId } = req.params;
  const attestations = await communityService.getEntryAttestations({ desciCommunityId: parseInt(communityId) });
  const data = _(attestations)
    .map((entry) => ({
      id: entry.id,
      attestationId: entry.attestationId,
      attestationVersionId: entry.attestationVersion.id,
      name: entry.attestationVersion.name,
      image_url: entry.attestationVersion.image_url,
    }))
    .value();
  new SuccessResponse(data).send(res);
};

export const createAttestation = async (req: Request, res: Response, _next: NextFunction) => {
  const body = req.body as Required<z.infer<typeof addAttestationSchema>['body']>;
  const { communityId } = req.params as z.infer<typeof addAttestationSchema>['params'];
  logger.trace({ communityId, body }, 'Payload');

  const community = await communityService.findCommunityById(Number(communityId));
  if (!community) throw new NotFoundError(`Community ${communityId} not found`);

  let assets: { key: string; url: string }[];
  let uploads = Array.isArray(req.files)
    ? req.files
    : Object.values(req.files)
        .map((files) => files[0])
        .filter(Boolean);

  if (uploads?.length > 0) {
    uploads = uploads.map((file) => {
      file.originalname = `${file.fieldname}.${file.originalname.split('.')?.[1]}`;
      return file;
    });

    const { ok, value } = await processUploadToIpfs({ files: uploads });
    if (ok && value) {
      assets = value.map((ipfsImg) => ({
        key: ipfsImg.path,
        url: `${process.env.IPFS_RESOLVER_OVERRIDE}/${ipfsImg.cid}`,
      }));
    } else {
      throw new BadRequestError('Could not upload file to ipfs');
    }
  }

  const image_url = assets?.find((img) => img.key.toLowerCase().includes('image'))?.url || body.imageUrl;
  delete body.imageUrl;
  const verified_image_url =
    assets?.find((img) => img.key.toLowerCase().includes('verifiedimage'))?.url || body.verifiedImageUrl;
  delete body.verifiedImageUrl;

  logger.trace({ image_url, verified_image_url }, 'Assets');

  if (!image_url) throw new BadRequestError('No attestation logo uploaded');

  const isProtected = body.protected.toString() === 'true' ? true : false;
  const doiPrivilege = body.canMintDoi.toString() === 'true' ? true : false;
  const orcidPrivilege = body.canUpdateOrcid.toString() === 'true' ? true : false;
  const attestation = await attestationService.create({
    ...body,
    image_url,
    verified_image_url,
    communityId: community.id,
    protected: isProtected,
    canMintDoi: doiPrivilege,
    canUpdateOrcid: orcidPrivilege,
  });
  // logger.trace({ attestation }, 'created');
  const AttestationVersion = await attestationService.getAttestationVersions(attestation.id);
  await attestationService.addCommunityEntryAttestation({
    communityId: Number(communityId),
    attestationId: attestation.id,
    // set to the lastest version
    attestationVersion: AttestationVersion[AttestationVersion.length - 1].id,
  });

  new SuccessResponse(attestation).send(res);
};

export const updateAttestation = async (req: Request, res: Response, _next: NextFunction) => {
  const body = req.body as Required<z.infer<typeof addAttestationSchema>['body']>;
  const { attestationId } = req.params as z.infer<typeof updateAttestationSchema>['params'];
  logger.info({ attestationId, body }, 'Payload');

  const exists = await attestationService.findAttestationById(Number(attestationId));
  if (!exists) throw new NotFoundError(`Attestation ${attestationId} not found`);

  let assets: { key: string; url: string }[] | undefined;
  let uploads = Array.isArray(req.files)
    ? req.files
    : Object.values(req.files)
        .map((files) => files[0])
        .filter(Boolean);

  logger.info({ uploads: uploads?.map((up) => up.fieldname) }, 'Uploads');
  if (uploads?.length > 0) {
    uploads = uploads.map((file) => {
      file.originalname = `${file.fieldname}.${file.originalname.split('.')?.[1]}`;
      return file;
    });
    const { ok, value } = await processUploadToIpfs({ files: uploads });
    logger.trace({ ok, value }, 'Uploads REsult');
    if (ok && value) {
      assets = value.map((ipfsImg) => ({
        key: ipfsImg.path,
        url: `${process.env.IPFS_RESOLVER_OVERRIDE}/${ipfsImg.cid}`,
      }));
    } else {
      throw new BadRequestError('Could not upload file to ipfs');
    }
  }

  const image_url =
    assets?.find((img) => img.key.toLowerCase().includes('image'))?.url || body.imageUrl || exists.image_url;
  const verified_image_url =
    assets?.find((img) => img.key.toLowerCase().includes('verifiedimage'))?.url ||
    body.verifiedImageUrl ||
    exists.verified_image_url;
  delete body.imageUrl;
  delete body.verifiedImageUrl;

  // logger.info({ image_url, verified_image_url }, 'Assets');

  if (!image_url) throw new BadRequestError('No attestation image uploaded');

  const isProtected = body.protected.toString() === 'true' ? true : false;
  const doiPrivilege = body.canMintDoi.toString() === 'true' ? true : false;
  const orcidPrivilege = body.canUpdateOrcid.toString() === 'true' ? true : false;
  const attestation = await attestationService.updateAttestation(exists.id, {
    ...body,
    image_url,
    verified_image_url,
    communityId: exists.communityId,
    protected: isProtected,
    canMintDoi: doiPrivilege,
    canUpdateOrcid: orcidPrivilege,
  });
  new SuccessResponse(attestation).send(res);
};

export const addMember = async (req: Request, res: Response, _next: NextFunction) => {
  const { userId, role }: Required<z.infer<typeof addMemberSchema>['body']> = req.body;
  const { communityId }: z.infer<typeof addMemberSchema>['params'] = req.params;

  const user = await prisma.user.findFirst({ where: { id: userId } });
  if (!user) throw new NotFoundError('Invalid user');

  const community = await communityService.findCommunityById(Number(communityId));
  if (!community) throw new NotFoundError(`No Desci community with ID: ${Number(communityId)} found!`);

  const exists = await communityService.findMemberByUserId(Number(communityId), userId);
  if (exists) throw new DuplicateDataError();

  const member = await communityService.addCommunityMember(parseInt(communityId), {
    userId,
    communityId: parseInt(communityId),
    role,
  });

  new SuccessResponse(member).send(res);
};

export const removeMember = async (req: Request, res: Response, _next: NextFunction) => {
  const { communityId, memberId }: z.infer<typeof removeMemberSchema>['params'] = req.params;

  const community = await communityService.findCommunityById(Number(communityId));
  if (!community) throw new NotFoundError(`No Desci community with ID: ${Number(communityId)} found!`);

  const exists = await communityService.findMemberById(Number(memberId));
  if (!exists) throw new NotFoundError();

  await communityService.removeMemberById(Number(memberId));

  new SuccessMessageResponse().send(res);
};

export const addEntryAttestation = async (req: Request, res: Response, _next: NextFunction) => {
  const { communityId, attestationId }: z.infer<typeof addEntryAttestationSchema>['params'] = req.params;

  const community = await communityService.findCommunityById(Number(communityId));
  if (!community) throw new NotFoundError(`No Desci community with ID: ${Number(communityId)} not found!`);

  const attestation = await attestationService.findAttestationById(+attestationId);
  if (!attestation) throw new NotFoundError(`No attestation with ID: ${Number(attestationId)} not found!`);

  const exists = await attestationService.getCommunityEntryAttestation(Number(communityId), Number(attestationId));
  if (exists) throw new DuplicateDataError();

  const data = await attestationService.addCommunityEntryAttestation({
    communityId: Number(communityId),
    attestationId: Number(attestationId),
    // set to the lastest version
    attestationVersion: attestation.AttestationVersion[attestation.AttestationVersion.length - 1].id,
  });

  new SuccessResponse(data).send(res);
};

export const removeEntryAttestation = async (req: Request, res: Response, _next: NextFunction) => {
  const { communityId, attestationId }: z.infer<typeof addEntryAttestationSchema>['params'] = req.params;

  const attestation = await attestationService.findAttestationById(+attestationId);
  if (!attestation) throw new NotFoundError(`No attestation with ID: ${Number(attestationId)} not found!`);

  const existing = await attestationService.getCommunityEntryAttestation(Number(communityId), Number(attestationId));
  if (!existing) {
    new SuccessMessageResponse().send(res);
    return;
  }

  const data = await attestationService.removeCommunityEntryAttestation({
    communityId: Number(communityId),
    attestationId: Number(attestationId),
    attestationVersion: existing.attestationVersionId,
  });

  new SuccessResponse(data).send(res);
};

export const toggleEntryAttestationRequirement = async (req: Request, res: Response, _next: NextFunction) => {
  const { entryId }: z.infer<typeof toggleEntryAttestationSchema>['params'] = req.params;
  await attestationService.toggleEntryAttestation(+entryId);
  new SuccessMessageResponse().send(res);
};
