import type { Request, Response } from 'express';
import { ThumbnailsService } from '../../services/thumbnails.js';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { TEMP_DIR, THUMBNAIL_OUTPUT_DIR } from '../../config/index.js';
import { BadRequestError, NotFoundError } from '../../utils/customErrors.js';
import { PdfManipulationService } from '../../services/pdf.js';

export type GeneratePreviewRequestBody = {
  cid: string;
  pages: number[];
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const BASE_TEMP_DIR = path.resolve(__dirname, '../../..', TEMP_DIR);

export const generatePreview = async (
  req: Request<any, any, GeneratePreviewRequestBody, { height: number }>,
  res: Response,
) => {
  const { cid, pages } = req.body;
  const { height = 1000 } = req.query;

  if (!cid) throw new BadRequestError('Missing cid in request body');
  if (!pages) throw new BadRequestError('Missing pages number array in request body');

  try {
    const previewPaths = await PdfManipulationService.generatePdfPreviews(cid, `${cid}.pdf`, pages, height);
    const previewStreams: fs.ReadStream[] = [];

    for (const previewPath of previewPaths) {
      const fullPreviewPath = path.join(BASE_TEMP_DIR, THUMBNAIL_OUTPUT_DIR, previewPath);

      // Check if the file exists before attempting to stream it
      await new Promise<void>((resolve, reject) => {
        fs.access(fullPreviewPath, fs.constants.F_OK, (err) => {
          if (err) {
            reject(new NotFoundError(`Preview not found for file with cid: ${cid}, path: ${previewPath}`));
          } else {
            resolve();
          }
        });
      });

      const readStream = fs.createReadStream(fullPreviewPath);
      previewStreams.push(readStream);
    }

    res.setHeader('Content-Type', 'application/json');
    res.status(200).json(previewStreams);
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
};
