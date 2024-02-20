import type { Request, Response } from 'express';
import { ThumbnailsService } from '../../services/thumbnails.js';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { TEMP_DIR, THUMBNAIL_OUTPUT_DIR } from '../../config/index.js';
import { BadRequestError, NotFoundError } from '../../utils/customErrors.js';

export type GenerateThumbnailRequestBody = {
  cid: string;
  fileName: string;
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const BASE_TEMP_DIR = path.resolve(__dirname, '../../..', TEMP_DIR);

export const generateThumbnail = async (req: Request<any, any, GenerateThumbnailRequestBody>, res: Response) => {
  const { cid, fileName } = req.body;
  if (!cid) throw new BadRequestError('Missing cid in request body');
  if (!fileName) throw new BadRequestError('Missing fileName in request body');

  try {
    const thumbnailPath = await ThumbnailsService.generateThumbnail(cid, fileName);
    const fullThumbnailPath = path.join(BASE_TEMP_DIR, THUMBNAIL_OUTPUT_DIR, thumbnailPath);

    // Check if the file exists before attempting to stream it
    fs.access(fullThumbnailPath, fs.constants.F_OK, (err) => {
      if (err) {
        throw new NotFoundError(`Thumbnail not found for file with cid: ${cid}`);
      }

      res.setHeader('Content-Type', 'image/png');
      const readStream = fs.createReadStream(fullThumbnailPath);

      readStream.pipe(res);
    });

    return res.status(200);
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
};
