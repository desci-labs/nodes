import type { Request, Response } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs/promises';
import { TEMP_DIR, THUMBNAIL_OUTPUT_DIR } from '../../config/index.js';
import { BadRequestError, NotFoundError } from '../../utils/customErrors.js';
import { PdfManipulationService } from '../../services/pdf.js';
import { logger as parentLogger } from '../../utils/logger.js';

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
  const logger = parentLogger.child({
    module: 'generatePreview Controller',
    pdfCid: cid,
  });

  if (!cid) throw new BadRequestError('Missing cid in request body');
  if (!pages) throw new BadRequestError('Missing pages number array in request body');

  try {
    // debugger;
    console.log('start preview', cid);
    const previewPaths = await PdfManipulationService.generatePdfPreviews(cid, `${cid}.pdf`, pages, height);
    console.log('done preview', cid);
    const previewBuffers: Buffer[] = [];
    for (const previewPath of previewPaths) {
      const fullPreviewPath = path.join(BASE_TEMP_DIR, THUMBNAIL_OUTPUT_DIR, previewPath);
      console.log({ fullPreviewPath });

      try {
        console.log('star read', fullPreviewPath);
        const previewBuffer = await fs.readFile(fullPreviewPath);
        console.log('done read', fullPreviewPath);
        previewBuffers.push(previewBuffer);
      } catch (err) {
        console.error(err);
        throw new NotFoundError(`Preview not found for file with cid: ${cid}, path: ${previewPath}`);
      }
    }

    console.log({ done: previewBuffers });
    res.setHeader('Content-Type', 'application/json');

    res.on('finish', async () => {
      // Cleanup generated previews after they're sent
      try {
        for (const previewPath of previewPaths) {
          const fullPreviewPath = path.join(BASE_TEMP_DIR, THUMBNAIL_OUTPUT_DIR, previewPath);
          await fs.unlink(fullPreviewPath);
          logger.info(`Successfully deleted preview file: ${fullPreviewPath}`);
        }
      } catch (error) {
        logger.error({ error }, 'Error during cleanup:');
      }
    });
    return res.status(200).json(previewBuffers);
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
};
