import { generateAsync } from 'filepreview_ts';
import { TEMP_DIR, THUMBNAIL_FILES_DIR, THUMBNAIL_OUTPUT_DIR } from '../config/index.js';
import { IpfsService } from './ipfs.js';
import { BadRequestError, UnhandledError } from '../utils/customErrors.js';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { logger as parentLogger } from '../utils/logger.js';

const logger = parentLogger.child({ module: 'Thumbnail Generation Service' });

const THUMBNAIL_DIMENSIONS = {
  height: 300,
  keepAspect: true,
  quality: '100',
  background: 'white',
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const BASE_TEMP_DIR = path.resolve(__dirname, '../..', TEMP_DIR);

export class ThumbnailsService {
  static async generateThumbnailFromCid(cid: string, fileName: string, heightPx: number) {
    const extension = '.' + fileName.split('.').pop();
    if (!extension) throw new BadRequestError('Invalid file name, requires extension');

    const tempFilePath = path.join(BASE_TEMP_DIR, THUMBNAIL_FILES_DIR, `${cid + extension}`);
    await IpfsService.saveFile(cid, tempFilePath);

    return this.generateThumbnail(tempFilePath, cid, heightPx);
  }

  static async generateThumbnailFromFile(filePath: string, fileName: string, heightPx: number) {
    const extension = '.' + fileName.split('.').pop();
    if (!extension) throw new BadRequestError('Invalid file name, requires extension');

    const identifier = path.basename(filePath, extension);
    return this.generateThumbnail(filePath, identifier, heightPx);
  }

  private static async generateThumbnail(tempFilePath: string, identifier: string, heightPx: number) {
    const thumbnailPath = this.getThumbnailPath(identifier);
    const exportPath = path.join(BASE_TEMP_DIR, THUMBNAIL_OUTPUT_DIR, thumbnailPath);

    try {
      await generateAsync(tempFilePath, exportPath, { ...THUMBNAIL_DIMENSIONS, height: heightPx });
      logger.info({ exportPath }, `Thumbnail generated successfully: ${exportPath}`);
      return thumbnailPath;
    } catch (e) {
      logger.error({ e }, `Failed generating thumbnail for file: ${identifier}`);
      throw new UnhandledError(`Failed generating thumbnail for file: ${identifier}`);
    } finally {
      // Only delete the temp file if it's not the original uploaded file
      if (!tempFilePath.includes(THUMBNAIL_FILES_DIR)) {
        try {
          await fs.promises.unlink(tempFilePath);
          logger.trace(`Temporary file ${tempFilePath} deleted successfully.`);
        } catch (cleanupError) {
          logger.error({ cleanupError, tempFilePath }, `Failed to delete temporary file ${tempFilePath}`);
        }
      }
    }
  }

  static getThumbnailPath(identifier: string) {
    return `h-${THUMBNAIL_DIMENSIONS.height}px_${identifier}.jpg`;
  }
}
