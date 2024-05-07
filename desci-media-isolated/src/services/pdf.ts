import { PDF_FILES_DIR, PDF_OUTPUT_DIR, TEMP_DIR } from '../config/index.js';
import { IpfsService } from './ipfs.js';
import { UnhandledError } from '../utils/customErrors.js';
import path from 'path';
import fs from 'fs';
import * as fsp from 'fs/promises';
import { fileURLToPath } from 'url';
import { PDFArray, PDFDict, PDFDocument, PDFName, PDFString, StandardFonts } from 'pdf-lib';
import { readFileToBuffer } from '../utils/utils.js';
import {
  PDF_JOB_TYPE,
  type AddPdfCoverParams,
  type DrawCenteredHelperParams,
  type DrawCenteredImagesParams,
  type PdfImageObject,
} from '../types/pdf.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const BASE_TEMP_DIR = path.resolve(__dirname, '../..', TEMP_DIR);

export class PdfManipulationService {
  static async addPdfCover({ taskId, cid, title, doi, dpid, codeAvailableDpid, dataAvailableDpid }: AddPdfCoverParams) {
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

      this.drawCenteredMultilineText({
        page: newPage,
        text: topHeader,
        font: helveticaFont,
        fontSize: headerSize,
        width,
        height,
        paddingX: 5,
        positionY: 0.01,
        hyperlink: `https://www.doi.org`,
      });

      /*
       * Title
       */
      const titleSize = 30;

      this.drawCenteredMultilineText({
        page: newPage,
        text: title,
        font: helveticaFont,
        fontSize: titleSize,
        width,
        height,
        paddingX: 20,
      });

      /*
       * Badges
       */
      const badges: PdfImageObject[] = [];
      if (codeAvailableDpid) {
        const codeBadgeBytes = await pdfDoc.embedPng(
          await readFileToBuffer(path.join(__dirname, '../../public/static/code-available.png')),
        );

        const codeBadge: PdfImageObject = {
          content: codeBadgeBytes,
          width: 125,
          height: 125,
          hyperlink: codeAvailableDpid,
        };
        badges.push(codeBadge);
      }
      if (dataAvailableDpid) {
        const dataBadgeBytes = await pdfDoc.embedPng(
          await readFileToBuffer(path.join(__dirname, '../../public/static/data-available.png')),
        );

        const dataBadge: PdfImageObject = {
          content: dataBadgeBytes,
          width: 125,
          height: 125,
          hyperlink: dataAvailableDpid,
        };
        badges.push(dataBadge);
      }

      if (badges.length) {
        this.drawCenteredImages({
          page: newPage,
          images: badges,
          pageWidth: width,
          pageHeight: height,
          positionY: 0.75,
          gap: 20,
        });
      }

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

  static async drawCenteredMultilineText({
    page,
    text,
    font,
    fontSize,
    width,
    height,
    paddingX = 0,
    positionY = 0.5,
    hyperlink,
  }: DrawCenteredHelperParams): Promise<void> {
    const lines: string[] = [];
    const words = text.split(' ');
    let currentLine = '';

    const availableWidth = width - 2 * paddingX;

    for (let i = 0; i < words.length; i++) {
      const word = words[i];
      const prospectiveLine = currentLine ? currentLine + ' ' + word : word;
      const prospectiveLineWidth: number = font.widthOfTextAtSize(prospectiveLine, fontSize);

      if (prospectiveLineWidth <= availableWidth) {
        currentLine = prospectiveLine;
      } else {
        lines.unshift(currentLine);
        currentLine = word;
      }
    }

    if (currentLine) {
      lines.unshift(currentLine);
    }

    const textHeight = font.heightAtSize(fontSize);
    const totalHeight = lines.length * textHeight;
    const startY = height * (1 - positionY) - totalHeight / 2;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineWidth = font.widthOfTextAtSize(line, fontSize);
      const x = paddingX + (availableWidth - lineWidth) / 2;
      const y = startY + i * textHeight;

      page.drawText(line, { x, y, size: fontSize, font });

      if (hyperlink && i === 0) {
        const linkAnnotation = page.doc.context.obj({
          Type: 'Annot',
          Subtype: 'Link',
          Rect: [x, y, x + lineWidth, y + textHeight],
          Border: [0, 0, 2],
          C: [0, 0, 1],
          A: {
            Type: 'Action',
            S: 'URI',
            URI: PDFString.of(hyperlink),
          },
        }) as PDFDict;

        const linkAnnotationRef = page.doc.context.register(linkAnnotation);

        const annotations = page.node.Annots() as PDFArray | undefined;
        const annotationsArray = annotations ?? page.doc.context.obj([]);
        annotationsArray.push(linkAnnotationRef);

        page.node.set(PDFName.of('Annots'), annotationsArray);
      }
    }
  }

  static async drawCenteredImages({
    page,
    images,
    pageWidth,
    pageHeight,
    paddingX = 0,
    gap = 0,
    positionY = 0.5,
  }: DrawCenteredImagesParams): Promise<void> {
    const availableWidth = pageWidth - 2 * paddingX;

    const rows: PdfImageObject[][] = [];
    let currentRow: PdfImageObject[] = [];
    let currentRowWidth = 0;

    for (const image of images) {
      if (currentRowWidth + image.width + (currentRow.length > 0 ? gap : 0) > availableWidth) {
        rows.push(currentRow);
        currentRow = [];
        currentRowWidth = 0;
      }
      currentRow.push(image);
      currentRowWidth += image.width + (currentRow.length > 1 ? gap : 0);
    }

    if (currentRow.length > 0) {
      rows.push(currentRow);
    }

    const rowHeights = rows.map((row) => Math.max(...row.map((image) => image.height)));
    const totalHeight = rowHeights.reduce((sum, height) => sum + height, 0) + (rows.length - 1) * gap;
    const startY = pageHeight * (1 - positionY) - totalHeight / 2;

    let currentY = startY;

    for (const row of rows) {
      const rowWidth = row.reduce((sum, image) => sum + image.width, 0) + (row.length - 1) * gap;
      let currentX = paddingX + (availableWidth - rowWidth) / 2;

      const rowHeight = Math.max(...row.map((image) => image.height));

      for (const image of row) {
        const x = currentX;
        const y = currentY + (rowHeight - image.height) / 2;

        page.drawImage(image.content, {
          x,
          y,
          width: image.width,
          height: image.height,
        });

        if (image.hyperlink) {
          const linkAnnotation = page.doc.context.obj({
            Type: 'Annot',
            Subtype: 'Link',
            Rect: [x, y, x + image.width, y + image.height],
            Border: [0, 0, 2],
            C: [0, 0, 1],
            A: {
              Type: 'Action',
              S: 'URI',
              URI: PDFString.of(image.hyperlink),
            },
          }) as PDFDict;

          const linkAnnotationRef = page.doc.context.register(linkAnnotation);

          const annotations = page.node.Annots() as PDFArray | undefined;
          const annotationsArray = annotations ?? page.doc.context.obj([]);
          annotationsArray.push(linkAnnotationRef);

          page.node.set(PDFName.of('Annots'), annotationsArray);
        }

        currentX += image.width + gap;
      }

      currentY += rowHeight + gap;
    }
  }
}
