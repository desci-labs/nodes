import { CommunityMembershipRole } from '@prisma/client';
import { NextFunction, Request, Response } from 'express';
import { z } from 'zod';

// import {
//   asyncMap,
//   attestationService,
//   BadRequestError,
//   communityService,
//   DuplicateDataError,
//   NotFoundError,
//   logger as parentLogger,
//   prisma,
//   SuccessMessageResponse,
//   SuccessResponse,
// } from '../../../internal.js';
import {
  addAttestationSchema,
  addCommunitySchema,
  addEntryAttestationSchema,
  addMemberSchema,
  removeMemberSchema,
  updateAttestationSchema,
  updateCommunitySchema,
} from '../../../routes/v1/admin/communities/schema.js';
import { processUploadToIpfs } from '../../../services/data/processing.js';

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

  const image_url = assets?.find((img) => img.key.toLowerCase().includes('imageurl'))?.url || body.imageUrl;
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
    assets?.find((img) => img.key.toLowerCase().includes('imageurl'))?.url || body?.imageUrl || community.image_url;
  delete body.imageUrl;

  if (!image_url) throw new BadRequestError('No community logo uploaded');
  const hidden = body.hidden.toString() === 'true' ? true : false;

  community = await communityService.updateCommunityById(+communityId, { ...body, hidden, image_url });
  new SuccessResponse(community).send(res);
};

export const listAllCommunities = async (_req: Request, res: Response, _next: NextFunction) => {
  const communities = await communityService.adminGetCommunities();
  logger.info({ communities }, 'List communities');
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

export const createAttestation = async (req: Request, res: Response, _next: NextFunction) => {
  const body = req.body as Required<z.infer<typeof addAttestationSchema>['body']>;
  const { communityId } = req.params as z.infer<typeof addAttestationSchema>['params'];
  logger.info({ communityId, body }, 'Payload');

  const community = await communityService.findCommunityById(Number(communityId));
  if (!community) throw new NotFoundError(`Community ${communityId} not found`);

  let assets: { key: string; url: string }[];
  let uploads = Array.isArray(req.files)
    ? req.files
    : Object.values(req.files)
        .map((files) => files[0])
        .filter(Boolean);

  if (uploads) {
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

  const image_url = assets.find((img) => img.key.toLowerCase().includes('imageurl'))?.url || body.imageUrl;
  delete body.imageUrl;
  const verified_image_url =
    assets.find((img) => img.key.toLowerCase().includes('verifiedimageurl'))?.url || body.verifiedImageUrl;
  delete body.verifiedImageUrl;

  logger.info({ image_url, verified_image_url }, 'Assets');

  if (!image_url) throw new BadRequestError('No community logo uploaded');

  const isProtected = body.protected.toString() === 'true' ? true : false;
  const attestation = await attestationService.create({
    ...body,
    image_url,
    verified_image_url,
    communityId: community.id,
    protected: isProtected,
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
    logger.info({ ok, value }, 'Uploads REsult');
    if (ok && value) {
      assets = value.map((ipfsImg) => ({
        key: ipfsImg.path,
        url: `${process.env.IPFS_RESOLVER_OVERRIDE}/${ipfsImg.cid}`,
      }));
    } else {
      throw new BadRequestError('Could not upload file to ipfs');
    }
  }

  const image_url = assets?.find((img) => img.key.toLowerCase().includes('imageurl'))?.url || body.imageUrl;
  const verified_image_url =
    assets?.find((img) => img.key.toLowerCase().includes('verifiedimageurl'))?.url || body.verifiedImageUrl;
  delete body.imageUrl;
  delete body.verifiedImageUrl;

  logger.info({ image_url, verified_image_url }, 'Assets');

  if (!image_url) throw new BadRequestError('No attestation image uploaded');

  const isProtected = body.protected.toString() === 'true' ? true : false;
  const attestation = await attestationService.updateAttestation(exists.id, {
    ...body,
    image_url,
    verified_image_url,
    communityId: exists.communityId,
    protected: isProtected,
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
    attestationVersion: attestation.AttestationVersion[attestation.AttestationVersion.length - 1].id,
  });

  new SuccessResponse(data).send(res);
};

export const removeEntryAttestation = async (req: Request, res: Response, _next: NextFunction) => {
  const { communityId, attestationId }: z.infer<typeof addEntryAttestationSchema>['params'] = req.params;

  const attestation = await attestationService.findAttestationById(+attestationId);
  if (!attestation) throw new NotFoundError(`No attestation with ID: ${Number(attestationId)} not found!`);

  const data = await attestationService.removeCommunityEntryAttestation({
    communityId: Number(communityId),
    attestationId: Number(attestationId),
    attestationVersion: attestation.AttestationVersion[attestation.AttestationVersion.length - 1].id,
  });

  new SuccessResponse(data).send(res);
};
