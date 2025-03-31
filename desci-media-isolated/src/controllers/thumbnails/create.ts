import type { Request, Response } from 'express';
import { ThumbnailsService } from '../../services/thumbnails.js';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { TEMP_DIR, THUMBNAIL_OUTPUT_DIR } from '../../config/index.js';
import { BadRequestError, NotFoundError } from '../../utils/customErrors.js';
import { logger as parentLogger } from '../../utils/logger.js';

export type GenerateThumbnailRequestBody = {
  cid?: string;
  fileName?: string;
};

interface GenerateThumbnailRequest extends Request {
  body: GenerateThumbnailRequestBody;
  query: {
    height?: string;
  };
  file?: Express.Multer.File;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const BASE_TEMP_DIR = path.resolve(__dirname, '../../..', TEMP_DIR);

export const generateThumbnail = async (req: GenerateThumbnailRequest, res: Response) => {
  const { cid } = req.body;
  const height = parseInt(req.query.height || '300');

  const logger = parentLogger.child({
    module: 'generateThumbnail Controller',
    cid,
  });

  try {
    let thumbnailPath: string;

    if (cid) {
      if (!req.body.fileName) throw new BadRequestError('fileName is required when using cid');
      thumbnailPath = await ThumbnailsService.generateThumbnailFromCid(cid, req.body.fileName, height);
    } else if (req.file) {
      thumbnailPath = await ThumbnailsService.generateThumbnailFromFile(req.file.path, req.file.originalname, height);
    } else {
      throw new BadRequestError('Either cid or file is required');
    }

    const fullThumbnailPath = path.join(BASE_TEMP_DIR, THUMBNAIL_OUTPUT_DIR, thumbnailPath);

    fs.access(fullThumbnailPath, fs.constants.F_OK, (err) => {
      if (err) {
        throw new NotFoundError(`Thumbnail not found for file`);
      }
      res.setHeader('Content-Type', 'image/png');
      const readStream = fs.createReadStream(fullThumbnailPath);
      readStream.pipe(res);
      readStream.on('end', () => {
        // Cleanup the generated thumbnail file after it's sent
        fs.unlink(fullThumbnailPath, (unlinkErr) => {
          if (unlinkErr) {
            logger.error({ unlinkErr }, `Failed to delete generated thumbnail file: ${fullThumbnailPath}`);
          } else {
            logger.info(`Successfully cleaned up generated thumbnail file: ${fullThumbnailPath}`);
          }
        });
      });
    });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
};
