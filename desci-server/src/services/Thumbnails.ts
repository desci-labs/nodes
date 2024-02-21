import axios from 'axios';

import { prisma } from '../client.js';
import { logger as parentLogger } from '../logger.js';
import { ensureUuidEndsWithDot } from '../utils.js';

import { getManifestByCid, getManifestFromNode, pinNewFiles } from './data/processing.js';
import { pinFile } from './ipfs.js';
import { NodeUuid } from './manifestRepo.js';
import repoService from './repoService.js';

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
    debugger;
    const manifest = manifestCid
      ? await getManifestByCid(manifestCid)
      : await repoService.getDraftManifest(uuid as NodeUuid);

    const pinnedComponents = manifest?.components?.filter((c) => c.starred);

    // Determined by the file extension (can't generate thumbnails for files without extensions)
    const fileComponents = pinnedComponents?.filter((c) => c.payload.path.split('/').pop().includes('.'));
    const fileComponentCids = fileComponents?.map((c) => c.payload.cid || c.payload.url);
    // const fileComponentCidMap = fileComponents.reduce((map, comp) => {
    //     const key = comp.payload.cid || comp.payload.url;
    //     map[key] = comp;
    //     return map;
    //   }, {});
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
    const generatedThumbnails = await Promise.all(
      Object.entries(thumbnailsToGenerate).map(([cid, fileName]) =>
        this.generateThumbnail(uuid, cid, fileName, HEIGHT_PX),
      ),
    );

    // Add the newly generated ones to the thumbnail map
    generatedThumbnails.forEach((newThumb) => {
      thumbnailMap[newThumb.componentCid] = { [HEIGHT_PX]: newThumb.thumbnailCid };
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
    // Generate the thumbnail
    const thumbnailStream = await axios.post(
      `${process.env.ISOLATED_MEDIA_SERVER_URL}/v1/thumbnails?height${heightPx}`,
      { cid: cid, fileName: componentFileName },
      {
        responseType: 'stream',
      },
    );

    // Save it on IPFS
    const pinned = await pinFile(thumbnailStream.data);
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

    // LATER: Add data ref

    // Return the CID
    return { componentCid: cid, height: heightPx, thumbnailCid: pinned.cid };
  }
}

export const thumbnailsService = new ThumbnailsService();
