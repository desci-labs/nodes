import type { Request, Response } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { PDF_OUTPUT_DIR, TEMP_DIR } from '../../config/index.js';
import { BadRequestError, NotFoundError } from '../../utils/customErrors.js';
import { PdfManipulationService } from '../../services/pdf.js';
import { logger as parentLogger } from '../../utils/logger.js';

export type GeneratePdfCoverRequestBody = {
  cid: string;
  doi?: string; // Optional, will use DPID if unavailable
  title: string;
  dpid: string;
  codeAvailableDpid?: string;
  dataAvailableDpid?: string;
  authors?: string[];
  license: string;
  publishDate: string;
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const BASE_TEMP_DIR = path.resolve(__dirname, '../../..', TEMP_DIR);

/**
 * Generates a cover page inserting a DOI and a DPID link for a PDF file provided via its CID
 */
export const generatePdfCover = async (
  req: Request<
    any,
    any,
    GeneratePdfCoverRequestBody,
    { header?: boolean; headerAllPages?: boolean; authorLimit?: number }
  >,
  res: Response,
) => {
  const { cid, doi, dpid, title, codeAvailableDpid, dataAvailableDpid, license, publishDate, authors } = req.body;
  const { header = true, headerAllPages = false, authorLimit } = req.query;
  const logger = parentLogger.child({
    module: 'GeneratePdfCover Controller',
    cid,
    doi,
    dpid,
    title,
    codeAvailableDpid,
    dataAvailableDpid,
    license,
    publishDate,
    authors,
    header,
    headerAllPages,
    authorLimit,
  });
  logger.trace('Generating prepub cover');

  try {
    if (!cid) throw new BadRequestError('Missing cid in request body');
    if (!dpid) throw new BadRequestError('Missing dpid in request body');
    if (!license) throw new BadRequestError('Missing license in request body');
    if (!publishDate) throw new BadRequestError('Missing publishDate in request body');

    const generationTaskId = crypto.randomUUID();

    const pdfPath = await PdfManipulationService.addPdfCover({
      taskId: generationTaskId,
      cid,
      doi,
      dpid,
      title,
      codeAvailableDpid,
      dataAvailableDpid,
      license,
      authors,
      publishDate,
      authorLimit,
    });
    const fullPdfPath = path.join(BASE_TEMP_DIR, PDF_OUTPUT_DIR, pdfPath);

    // Check if the file exists before attempting to stream it
    fs.access(fullPdfPath, fs.constants.F_OK, (err) => {
      if (err) {
        throw new NotFoundError(`PDF not found for file with path: ${cid}`);
      }

      res.setHeader('Content-Type', 'application/pdf');
      const readStream = fs.createReadStream(fullPdfPath);

      readStream.pipe(res);

      readStream.on('end', () => {
        // Cleanup the generated PDF file
        fs.unlink(fullPdfPath, (unlinkErr) => {
          if (unlinkErr) {
            logger.error({ unlinkErr }, `Failed to delete generated cover file: ${fullPdfPath}`);
          } else {
            logger.info(`Successfully cleaned up generated cover file: ${fullPdfPath}`);
          }
        });
      });
    });

    return res.status(200);
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
};
