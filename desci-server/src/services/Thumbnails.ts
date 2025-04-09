import { Readable } from 'stream';

import { ResearchObjectComponentType } from '@desci-labs/desci-models';
import { DataType, User } from '@prisma/client';
import axios from 'axios';
import FormData from 'form-data';
import { req } from 'pino-std-serializers';

import { prisma } from '../client.js';
import { logger as parentLogger } from '../logger.js';
import { attachLoggedData } from '../utils/dataRefTools.js';
import { ensureUuidEndsWithDot } from '../utils.js';

import { getManifestByCid } from './data/processing.js';
import { getNodeToUse, IPFS_NODE, pinFile } from './ipfs.js';
import { NodeUuid, getLatestManifestFromNode } from './manifestRepo.js';

const logger = parentLogger.child({
  module: 'Services::Thumbnails',
});

export type HeightPx = number;
export type CidString = string;
export type FileName = string;

export type Thumbnail = Record<HeightPx, CidString>;
export type ThumbnailMap = Record<CidString, Thumbnail>;

type GenerateThumbnailResult = {
  componentCid: CidString;
  height: HeightPx;
  thumbnailCid: CidString;
} | null;

// Hardcoded for the time being, we can modify this logic if the need more size variants
const HEIGHT_PX = 300;

export class ThumbnailsService {
  async getThumbnailsForNode({
    uuid,
    manifestCid,
    // heightPx,
  }: {
    uuid: NodeUuid;
    manifestCid?: string;
    // heightPx: HeightPx;
  }): Promise<ThumbnailMap> {
    // debugger;
    const node = await prisma.node.findFirst({ where: { uuid: ensureUuidEndsWithDot(uuid) } });

    const manifest = manifestCid ? await getManifestByCid(manifestCid) : await getLatestManifestFromNode(node);

    const pinnedComponents = manifest?.components?.filter((c) => c.starred);

    // Determined by the file extension (can't generate thumbnails for files without extensions)
    const fileComponents = pinnedComponents?.filter(
      (c) => c.payload.path.split('/').pop().includes('.') && c.type !== ResearchObjectComponentType.LINK,
    );
    const fileComponentCids = fileComponents?.map((c) => c.payload.cid || c.payload.url);

    if (!fileComponents) return {};

    const thumbnailsToGenerate: Record<CidString, FileName> = fileComponents?.reduce((map, comp) => {
      const fileName = comp.payload.path.split('/').pop();
      const cid = comp.payload.cid || comp.payload.url;
      map[cid] = fileName;
      return map;
    }, {});

    const thumbnailMap: ThumbnailMap = {};
    // Check which thumbnails already exist
    const existingThumbnailsFound = await prisma.nodeThumbnails.findMany({
      where: { componentCid: { in: fileComponentCids }, nodeUuid: ensureUuidEndsWithDot(uuid) },
    });
    // Check if the desired sizes exist, otherwise add to the generation array
    for (const thumbnail of existingThumbnailsFound) {
      const desiredSizeThumbnail = thumbnail.thumbnails[HEIGHT_PX];
      if (desiredSizeThumbnail) {
        // If exists, add it to the returned thumbnail map.
        thumbnailMap[thumbnail.componentCid] = thumbnail.thumbnails as Thumbnail;
        // Remove it from the generation map
        delete thumbnailsToGenerate[thumbnail.componentCid];
      }
    }

    // Generate thumbnails for the ones that don't exist
    const generatedThumbnails = await Promise.allSettled(
      Object.entries(thumbnailsToGenerate).map(([cid, fileName]) =>
        this.generateThumbnail(uuid, cid, fileName, HEIGHT_PX),
      ),
    );

    // Add the newly generated ones to the thumbnail map
    generatedThumbnails.forEach((newThumb) => {
      if (newThumb.status === 'fulfilled' && 'componentCid' in newThumb.value) {
        thumbnailMap[newThumb.value.componentCid] = { [HEIGHT_PX]: newThumb.value.thumbnailCid };
      }
    });

    return thumbnailMap;
  }

  private async generateThumbnail(
    nodeUuid: string,
    cid: CidString,
    componentFileName: string,
    heightPx: HeightPx,
  ): Promise<GenerateThumbnailResult> {
    if (process.env.ISOLATED_MEDIA_SERVER_URL === undefined) {
      logger.error('process.env.ISOLATED_MEDIA_SERVER_URL is not defined');
      return null;
    }

    const node = await prisma.node.findFirst({
      where: { uuid: ensureUuidEndsWithDot(nodeUuid) },
      select: { id: true, ownerId: true },
    });
    const user = await prisma.user.findFirst({ where: { id: node.ownerId } });

    // Generate the thumbnail
    const thumbnailStream = await axios.post(
      `${process.env.ISOLATED_MEDIA_SERVER_URL}/v1/thumbnails?height=${heightPx}`,
      { cid: cid, fileName: componentFileName },
      {
        responseType: 'stream',
      },
    );
    // Save it on IPFS
    const pinned = await pinFile(thumbnailStream.data, { ipfsNode: getNodeToUse(user.isGuest) });

    // Create data ref
    const thumbnailDataRef = {
      nodeId: node.id,
      cid: pinned.cid,
      type: DataType.THUMBNAIL,
      size: pinned.size,
      root: false,
      directory: false,
      userId: user.id,
      ...(user.isGuest ? attachLoggedData() : {}),
    };

    const createdDataRef = user.isGuest
      ? await prisma.guestDataReference.create({ data: thumbnailDataRef })
      : await prisma.dataReference.create({ data: thumbnailDataRef });
    logger.info({ createdDataRef }, 'Created data ref for thumbnail');

    // Save it to the database
    const existingThumbnail = await prisma.nodeThumbnails.findFirst({
      where: { componentCid: cid },
    });

    if (existingThumbnail) {
      const thumbnails = existingThumbnail.thumbnails as Thumbnail;
      await prisma.nodeThumbnails.update({
        where: { id: existingThumbnail.id },
        data: { thumbnails: { ...thumbnails, [heightPx]: pinned.cid } },
      });
    } else {
      await prisma.nodeThumbnails.create({
        data: { nodeUuid: ensureUuidEndsWithDot(nodeUuid), componentCid: cid, thumbnails: { [heightPx]: pinned.cid } },
      });
    }

    // Return the CID
    return { componentCid: cid, height: heightPx, thumbnailCid: pinned.cid };
  }

  async generateThumbnailFromStream(
    fileStream: Readable,
    fileName: string,
    heightPx: HeightPx = HEIGHT_PX,
  ): Promise<Readable> {
    if (process.env.ISOLATED_MEDIA_SERVER_URL === undefined) {
      logger.error('process.env.ISOLATED_MEDIA_SERVER_URL is not defined');
      throw new Error('Isolated media server URL is not defined');
    }

    try {
      const form = new FormData();
      form.append('file', fileStream, {
        filename: fileName,
        contentType: 'application/octet-stream',
      });

      const response = await axios.post(
        `${process.env.ISOLATED_MEDIA_SERVER_URL}/v1/thumbnails?height=${heightPx}`,
        form,
        {
          headers: {
            ...form.getHeaders(),
          },
          responseType: 'stream',
        },
      );

      return response.data;
    } catch (error) {
      logger.error('Error generating thumbnail from stream:', error);
      throw new Error('Failed to generate thumbnail from stream');
    }
  }
}

export const thumbnailsService = new ThumbnailsService();
