import { NextFunction, Request, Response } from 'express';
import { z } from 'zod';

import {
  asyncMap,
  BadRequestError,
  communityService,
  logger as parentLogger,
  SuccessMessageResponse,
  SuccessResponse,
} from '../../../internal.js';
import { addCommunitySchema } from '../../../routes/v1/admin/communities/schema.js';
import { processUploadToIpfs } from '../../../services/data/processing.js';

const logger = parentLogger.child({ module: 'Admin/Communities/controller' });

export const todoApi = async (_req: Request, res: Response, next: NextFunction) => {
  new SuccessMessageResponse().send(res);
};

export const createCommunity = async (req: Request, res: Response, _next: NextFunction) => {
  const body = req.body as Required<z.infer<typeof addCommunitySchema>['body']>;

  let assets: { key: string; url: string }[];
  if (req.files) {
    let uploads = Array.isArray(req.files) ? req.files : Object.values(req.files).map((files) => files[0]);
    uploads = uploads.map((file) => {
      file.originalname = `${file.fieldname}.${file.originalname.split('.')?.[1]}`;
      return file;
    });
    const { ok, value } = await processUploadToIpfs({ files: uploads });
    if (ok) {
      assets = value.map((ipfsImg) => ({
        key: ipfsImg.path,
        url: `${process.env.IPFS_RESOLVER_OVERRIDE}/${ipfsImg.cid}`,
      }));
    } else {
      throw new BadRequestError('Could not upload file to ipfs');
    }
  }

  const image_url = body.imageUrl || assets.find((img) => img.key.toLowerCase().includes('imageurl'))?.url;
  delete body.imageUrl;

  if (!image_url) throw new BadRequestError('No community logo uploaded');

  // logger.info({ ...body, image_url }, 'payload');
  const community = await communityService.createCommunity({ ...body, image_url });
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
