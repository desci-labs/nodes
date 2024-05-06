import type { Request, Response } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { PDF_OUTPUT_DIR, TEMP_DIR } from '../../config/index.js';
import { BadRequestError, NotFoundError } from '../../utils/customErrors.js';
import { PdfManipulationService } from '../../services/pdf.js';

export type GeneratePdfCoverRequestBody = {
  cid: string;
  doi: string;
  title: string;
  dpid?: string;
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const BASE_TEMP_DIR = path.resolve(__dirname, '../../..', TEMP_DIR);

/**
 * Generates a cover page inserting a DOI and a DPID link for a PDF file provided via its CID
 */
export const generatePdfCover = async (
  req: Request<any, any, GeneratePdfCoverRequestBody, { header: boolean; headerAllPages: boolean }>,
  res: Response,
) => {
  const { cid, doi, dpid, title } = req.body;
  const { header = true, headerAllPages = false } = req.query;
  try {
    if (!cid) throw new BadRequestError('Missing cid in request body');
    if (!doi) throw new BadRequestError('Missing doi in request body');
    if (!title) throw new BadRequestError('Missing title in request body');

    const generationTaskId = crypto.randomUUID();

    const pdfPath = await PdfManipulationService.addPdfCover({ taskId: generationTaskId, cid, doi, dpid, title });
    const fullPdfPath = path.join(BASE_TEMP_DIR, PDF_OUTPUT_DIR, pdfPath);

    // Check if the file exists before attempting to stream it
    fs.access(fullPdfPath, fs.constants.F_OK, (err) => {
      if (err) {
        throw new NotFoundError(`PDF not found for file with path: ${cid}`);
      }

      res.setHeader('Content-Type', 'application/pdf');
      const readStream = fs.createReadStream(fullPdfPath);

      readStream.pipe(res);
    });

    return res.status(200);
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
};
