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
    const previewPaths = await PdfManipulationService.generatePdfPreviews(cid, `${cid}.pdf`, pages, height);
    const previewBuffers: Buffer[] = [];
    for (const previewPath of previewPaths) {
      const fullPreviewPath = path.join(BASE_TEMP_DIR, THUMBNAIL_OUTPUT_DIR, previewPath);

      try {
        const previewBuffer = await fs.readFile(fullPreviewPath);
        previewBuffers.push(previewBuffer);
      } catch (err) {
        throw new NotFoundError(`Preview not found for file with cid: ${cid}, path: ${previewPath}`);
      }
    }

    res.setHeader('Content-Type', 'application/json');
    res.status(200).json(previewBuffers);

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
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
};
