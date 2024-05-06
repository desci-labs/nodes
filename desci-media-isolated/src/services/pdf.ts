import { PDF_FILES_DIR, PDF_OUTPUT_DIR, TEMP_DIR } from '../config/index.js';
import { IpfsService } from './ipfs.js';
import { UnhandledError } from '../utils/customErrors.js';
import path from 'path';
import fs from 'fs';
import * as fsp from 'fs/promises';
import { fileURLToPath } from 'url';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { readFileToBuffer } from '../utils/utils.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const BASE_TEMP_DIR = path.resolve(__dirname, '../..', TEMP_DIR);

export enum PDF_JOB_TYPE {
  ADD_COVER = 'cover',
}

export interface AddPdfCoverParams {
  taskId: string;
  cid: string;
  title: string;
  doi: string;
  dpid?: string;
}

export class PdfManipulationService {
  static async addPdfCover({ taskId, cid, title, doi, dpid }: AddPdfCoverParams) {
    const tempFilePath = path.join(BASE_TEMP_DIR, PDF_FILES_DIR, `${taskId}.pdf`); // Saved pdf to manipulate
    const outputPdfFileName = this.getPdfPath(PDF_JOB_TYPE.ADD_COVER, cid);
    const outputFullPath = path.join(BASE_TEMP_DIR, PDF_OUTPUT_DIR, outputPdfFileName);
    debugger;
    await IpfsService.saveFile(cid, tempFilePath); //failing
    debugger;
    try {
      // Proccess the pdf file to add the cover page
      const pdfBytes = await readFileToBuffer(tempFilePath);
      const pdfDoc = await PDFDocument.load(pdfBytes);
      const helveticaFont = await pdfDoc.embedFont(StandardFonts.Helvetica);

      const newPage = pdfDoc.insertPage(0);
      const { width, height } = newPage.getSize();

      const topHeader = `DOI ${doi} all code and data is available here`;

      newPage.drawText(topHeader, {
        x: 10,
        y: 5,
        size: 12,
      });

      const pdfBytesMod = await pdfDoc.save();
      await fsp.writeFile(outputFullPath, pdfBytesMod);

      console.log('Cover page generated successfully:', outputFullPath);
      return outputPdfFileName;
    } catch (e) {
      console.error(e);
      throw new UnhandledError(
        `Failed generating cover page for file with cid: ${cid}, with temp file path: ${tempFilePath}`,
      );
    } finally {
      // The initially saved file is removed, however the generated pdf remains. Further cleanup can be done for the generated pdf result.
      try {
        await fs.unlink(tempFilePath, (err) => {
          if (err) {
            console.error(err, `Failed to cleanup temporary file: ${tempFilePath}`);
            return;
          }
          console.log(`Temporary file ${tempFilePath} deleted successfully.`);
        });
      } catch (cleanupError) {
        console.error(`Failed to delete temporary file ${tempFilePath}:`, cleanupError);
      }
    }
  }

  static getPdfPath(jobType: PDF_JOB_TYPE, generationTaskId: string) {
    return `${jobType}-${generationTaskId}.pdf`;
  }
}
