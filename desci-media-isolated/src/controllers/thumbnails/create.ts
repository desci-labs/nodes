import { Request, Response } from 'express';
import { ThumbnailsService } from '../../services/thumbnails';
import path from 'path';
import fs from 'fs';
import { TEMP_DIR } from '../../config';
import { BadRequestError, NotFoundError } from '../../utils/customErrors';

export type GenerateThumbnailRequestBody = {
  cid: string;
  fileName: string;
};

const BASE_TEMP_DIR = path.resolve(__dirname, '../../..', TEMP_DIR);

export const generateThumbnail = async (req: Request<any, any, GenerateThumbnailRequestBody>, res: Response) => {
  const { cid, fileName } = req.body;
  if (!cid) throw new BadRequestError('Missing cid in request body');
  if (!fileName) throw new BadRequestError('Missing fileName in request body');

  try {
    const thumbnailPath = await ThumbnailsService.generateThumbnail(cid);
    const fullThumbnailPath = path.join(BASE_TEMP_DIR, thumbnailPath);

    // Check if the file exists before attempting to stream it
    fs.access(fullThumbnailPath, fs.constants.F_OK, (err) => {
      if (err) {
        throw new NotFoundError(`Thumbnail not found for file with cid: ${cid}`);
      }

      res.setHeader('Content-Type', 'image/png');
      const readStream = fs.createReadStream(fullThumbnailPath);

      readStream.pipe(res);
    });

    // Send the thumbnail as a response
    res.status(200);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
};
