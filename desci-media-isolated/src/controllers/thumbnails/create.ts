import type { Request, Response } from 'express';
import { ThumbnailsService } from '../../services/thumbnails.js';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { TEMP_DIR, THUMBNAIL_OUTPUT_DIR } from '../../config/index.js';
import { BadRequestError, NotFoundError } from '../../utils/customErrors.js';

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
  const { cid, fileName } = req.body;
  const height = parseInt(req.query.height || '300');

  const finalFileName = fileName || (req.file && req.file.originalname);
  if (!finalFileName) throw new BadRequestError('Missing fileName in request body or file upload');

  try {
    let thumbnailPath: string;

    if (cid) {
      thumbnailPath = await ThumbnailsService.generateThumbnailFromCid(cid, finalFileName, height);
    } else if (req.file) {
      thumbnailPath = await ThumbnailsService.generateThumbnailFromFile(req.file.path, finalFileName, height);
    } else {
      throw new BadRequestError('Either cid or file is required');
    }

    const fullThumbnailPath = path.join(BASE_TEMP_DIR, THUMBNAIL_OUTPUT_DIR, thumbnailPath);

    fs.access(fullThumbnailPath, fs.constants.F_OK, (err) => {
      if (err) {
        throw new NotFoundError(`Thumbnail not found for file: ${finalFileName}`);
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
