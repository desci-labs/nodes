import { PDF_FILES_DIR, PDF_OUTPUT_DIR, TEMP_DIR } from '../config/index.js';
import { IpfsService } from './ipfs.js';
import { UnhandledError } from '../utils/customErrors.js';
import path from 'path';
import fs from 'fs';
import * as fsp from 'fs/promises';
import { fileURLToPath } from 'url';
import { PDFDocument, PDFFont, PDFPage, StandardFonts } from 'pdf-lib';
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
    // debugger;
    await IpfsService.saveFile(cid, tempFilePath); //failing
    // debugger;
    try {
      // Proccess the pdf file to add the cover page
      const pdfBytes = await readFileToBuffer(tempFilePath);
      const pdfDoc = await PDFDocument.load(pdfBytes);
      const helveticaFont = await pdfDoc.embedFont(StandardFonts.Helvetica);

      const newPage = pdfDoc.insertPage(0);
      const { width, height } = newPage.getSize();

      /*
       * Header
       */
      const topHeader = `DOI ${doi} all code and data is available here`;
      const headerSize = 12;
      newPage.drawText(topHeader, {
        x: 10,
        y: height - 20,
        size: 12,
      });

      /*
       * Title
       */
      const titleSize = 30;
      // const textWidth = helveticaFont.widthOfTextAtSize(title, titleSize);
      // const textHeight = helveticaFont.heightAtSize(titleSize);

      // newPage.drawText(title, {
      //   x: (width - textWidth) / 2,
      //   y: height / 2 + textHeight / 2,
      //   size: titleSize,
      //   font: helveticaFont,
      // });

      this.drawCenteredMultilineText(newPage, title, helveticaFont, titleSize, width, height);

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

  static drawCenteredMultilineText(
    page: PDFPage,
    text: string,
    font: PDFFont,
    fontSize: number,
    width: number,
    height: number,
  ): void {
    const lines: string[] = [];
    const words = text.split(' ');
    let currentLine = '';

    for (let i = 0; i < words.length; i++) {
      const word = words[i];
      const prospectiveLine = currentLine ? currentLine + ' ' + word : word;
      const prospectiveLineWidth: number = font.widthOfTextAtSize(prospectiveLine, fontSize);

      if (prospectiveLineWidth <= width) {
        currentLine = prospectiveLine;
      } else {
        lines.push(currentLine);
        currentLine = word;
      }
    }

    if (currentLine) {
      lines.push(currentLine);
    }

    const textHeight = font.heightAtSize(fontSize);
    const totalHeight = lines.length * textHeight;
    const startY = (height - totalHeight) / 2;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineWidth = font.widthOfTextAtSize(line, fontSize);
      const x = (width - lineWidth) / 2;
      const y = startY + i * textHeight;

      page.drawText(line, { x, y, size: fontSize, font });
    }
  }
}
