import { NextFunction, Request, Response } from 'express';
import { z } from 'zod';

import {
  asyncMap,
  BadRequestError,
  communityService,
  DuplicateDataError,
  NotFoundError,
  logger as parentLogger,
  SuccessMessageResponse,
  SuccessResponse,
} from '../../../internal.js';
import { addCommunitySchema, updateCommunitySchema } from '../../../routes/v1/admin/communities/schema.js';
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

  if (uploads) {
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

  const image_url = assets.find((img) => img.key.toLowerCase().includes('imageurl'))?.url || body.imageUrl;
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

  let community = await communityService.findCommunityById(parseInt(communityId));

  if (!community) throw new NotFoundError();

  let assets: { key: string; url: string }[];
  let uploads = Array.isArray(req.files)
    ? req.files
    : Object.values(req.files)
        ?.map((files) => files[0])
        .filter(Boolean);

  logger.info({ uploads: !!uploads }, 'Uploads');
  if (uploads?.length) {
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

  community = await communityService.updateCommunityById(parseInt(communityId), { ...body, hidden, image_url });
  new SuccessResponse(community).send(res);
};

export const listAllCommunities = async (_req: Request, res: Response, next: NextFunction) => {
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
