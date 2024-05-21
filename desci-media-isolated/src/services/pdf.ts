import { PDF_FILES_DIR, PDF_OUTPUT_DIR, TEMP_DIR } from '../config/index.js';
import { IpfsService } from './ipfs.js';
import { UnhandledError } from '../utils/customErrors.js';
import path from 'path';
import fs from 'fs';
import * as fsp from 'fs/promises';
import { fileURLToPath } from 'url';
import { PDFArray, PDFDict, PDFDocument, PDFName, PDFString, StandardFonts, rgb } from 'pdf-lib';
import { readFileToBuffer, startsWithVowel } from '../utils/utils.js';
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
  static async addPdfCover({
    taskId,
    cid,
    title,
    doi,
    dpid,
    codeAvailableDpid,
    dataAvailableDpid,
    authors,
    authorLimit,
    license,
    publishDate,
  }: AddPdfCoverParams) {
    const tempFilePath = path.join(BASE_TEMP_DIR, PDF_FILES_DIR, `${taskId}.pdf`); // Saved pdf to manipulate
    const outputPdfFileName = this.getPdfPath(PDF_JOB_TYPE.ADD_COVER, cid);
    const outputFullPath = path.join(BASE_TEMP_DIR, PDF_OUTPUT_DIR, outputPdfFileName);
    // debugger;
    await IpfsService.saveFile(cid, tempFilePath);
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
      const licenseStartsWithVowel = startsWithVowel(license);
      const topHeader = `Research object https://doi.org/${doi}, this version posted ${publishDate}. The copyright holder for this research object (which was not certified by peer review) is the author/funder, who has granted DeSci Labs a non-exclsuive license to display the research object in perpetuity. It is made available under a${
        licenseStartsWithVowel ? 'n' : ''
      } ${license} license.`;
      const headerSize = 12;

      this.drawCenteredMultilineText({
        page: newPage,
        text: topHeader,
        font: helveticaFont,
        fontSize: headerSize,
        width,
        height,
        paddingX: 15,
        positionY: 0.04,
        hyperlink: `https://doi.org/${doi}`,
      });

      /*
       * Title
       */
      const titleSize = 30;
      const titlePosY = 0.35;

      const titleLines = await this.drawCenteredMultilineText({
        page: newPage,
        text: title,
        font: helveticaFont,
        fontSize: titleSize,
        width,
        height,
        positionY: titlePosY,
        paddingX: 100,
      });

      /*
       * Authors
       */
      const authorsProcessed = this.formatAuthors(authors || [], authorLimit);
      const authorsSize = 18;
      const titleHeight = titleLines.length * helveticaFont.heightAtSize(titleSize);
      const authorsPosY = titlePosY + titleHeight / height;

      const authorsLines = await this.drawCenteredMultilineText({
        page: newPage,
        text: authorsProcessed,
        font: helveticaFont,
        fontSize: authorsSize,
        width,
        height,
        paddingX: 100,
        positionY: authorsPosY,
      });

      /*
       * Center Text (Artifacts available here)
       */
      const centeredText = 'Data and/or code available at:';
      const centeredTextSize = 20;
      const authorsHeight = authorsLines.length * helveticaFont.heightAtSize(authorsSize);
      const centeredTextPosY = authorsPosY + authorsHeight / height + 0.1;

      this.drawCenteredMultilineText({
        page: newPage,
        text: centeredText,
        font: helveticaFont,
        fontSize: centeredTextSize,
        width,
        height,
        paddingX: 100,
        positionY: centeredTextPosY,
      });

      /*
       * DOI URL
       */
      const doiUrl = `https://doi.org/${doi}`;
      const doiUrlSize = 20;
      const centeredTextHeight = helveticaFont.heightAtSize(centeredTextSize);
      const doiUrlPosY = centeredTextPosY + centeredTextHeight / height + 0.01;
      const doiUrlColor = rgb(0, 0, 1);

      this.drawCenteredMultilineText({
        page: newPage,
        text: doiUrl,
        font: helveticaFont,
        fontSize: doiUrlSize,
        width,
        height,
        paddingX: 100,
        positionY: doiUrlPosY,
        hyperlink: doiUrl,
        color: doiUrlColor,
      });

      /*
       * Badges
       */
      const badges: PdfImageObject[] = [];

      const badgeSize = 50;

      if (codeAvailableDpid) {
        const openCodeBytes = await pdfDoc.embedPng(
          await readFileToBuffer(path.join(__dirname, '../../public/static/code-available.png')),
        );
        badges.push({
          content: openCodeBytes,
          width: badgeSize,
          height: badgeSize,
          text: 'Open Code',
          hyperlink: codeAvailableDpid,
        });
      }
      if (dataAvailableDpid) {
        const openDataBytes = await pdfDoc.embedPng(
          await readFileToBuffer(path.join(__dirname, '../../public/static/data-available.png')),
        );
        badges.push({
          content: openDataBytes,
          width: badgeSize,
          height: badgeSize,
          text: 'Open Data',
          hyperlink: dataAvailableDpid,
        });
      }

      const claimedBadgesTitle = 'Claimed badges:';
      const claimedBadgesTitleSize = 14;
      const claimedBadgesTitlePosY = 0.75;

      if (badges.length) {
        this.drawCenteredMultilineText({
          page: newPage,
          text: claimedBadgesTitle,
          font: helveticaFont,
          fontSize: claimedBadgesTitleSize,
          width,
          height,
          paddingX: 100,
          positionY: claimedBadgesTitlePosY,
        });

        this.drawCenteredImages({
          page: newPage,
          images: badges,
          pageWidth: width,
          pageHeight: height,
          positionY: claimedBadgesTitlePosY + claimedBadgesTitleSize / height + 0.04,
          gap: 20,
          annotateImage: true,
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
    color = rgb(0, 0, 0),
  }: DrawCenteredHelperParams): Promise<string[]> {
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

      page.drawText(line, { x, y, size: fontSize, font, color });

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
    return lines;
  }

  static async drawCenteredImages({
    page,
    images,
    pageWidth,
    pageHeight,
    paddingX = 0,
    gap = 0,
    positionY = 0.5,
    annotateImage = false, // renders image.text besides it
    font,
  }: DrawCenteredImagesParams): Promise<void> {
    const availableWidth = pageWidth - 2 * paddingX;

    const embedDefaultFont = async () => {
      if (!font) {
        return await page.doc.embedFont(StandardFonts.Helvetica);
      }
      return font;
    };

    const embeddedFont = await embedDefaultFont();

    const imagesWithTextDimensions = await Promise.all(
      images.map(async (image) => {
        if (annotateImage && image.text) {
          const textWidth = embeddedFont.widthOfTextAtSize(image.text, 12);
          const textHeight = embeddedFont.heightAtSize(12);
          return { ...image, textWidth, textHeight };
        }
        return image;
      }),
    );

    const totalWidth = imagesWithTextDimensions.reduce(
      (sum, image) => sum + image.width + (annotateImage && image.text ? (image.textWidth ?? 0) + gap : 0),
      0,
    );

    const startX = (pageWidth - totalWidth) / 2;

    let currentX = startX;

    for (const image of imagesWithTextDimensions) {
      const x = currentX;
      const y = pageHeight * (1 - positionY) - image.height / 2;

      page.drawImage(image.content, {
        x,
        y,
        width: image.width,
        height: image.height,
      });

      if (annotateImage && image.text) {
        const textX = x + image.width + 10;
        const textY = y + (image.height - (image.textHeight ?? 0)) / 2;

        page.drawText(image.text, {
          x: textX,
          y: textY,
          size: 12,
          font: embeddedFont,
          color: rgb(0, 0, 0),
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

        currentX += image.width + (image.textWidth ?? 0) + gap;
      } else {
        currentX += image.width + gap;
      }
    }
  }

  static formatAuthors(authors: string[], limit: number = 5): string {
    const exceedsLimit = authors.length > limit;
    const authorsToFormat = exceedsLimit ? authors.slice(0, limit) : authors;

    const formattedAuthors = authorsToFormat.map((author) => {
      const names = author.trim().split(' ');
      const lastName = names[names.length - 1];
      const firstInitial = names[0][0].toUpperCase();
      return `${firstInitial}. ${lastName}`;
    });

    return exceedsLimit ? `${formattedAuthors.join(', ')}, et al.` : formattedAuthors.join(', ');
  }
}