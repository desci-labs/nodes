import type { PDFFont, PDFImage, PDFPage, Color } from 'pdf-lib';

export enum PDF_JOB_TYPE {
  ADD_COVER = 'cover',
}

export interface AddPdfCoverParams {
  taskId: string;
  cid: string;
  title: string;
  doi: string;
  dpid?: string;
  codeAvailableDpid?: string;
  dataAvailableDpid?: string;
  reprodEnabledDpid?: string;
  authors?: string[];
  authorLimit?: number;
  license: string;
  publishDate: string;
}

export interface DrawCenteredHelperParams {
  page: PDFPage;
  text: string;
  font: PDFFont;
  fontSize: number;
  width: number;
  height: number;
  paddingX?: number;
  positionY?: number; // 0-1, vertical alignment, e.g. 0.5 is the center.
  hyperlink?: string;
  color?: Color;
}

export interface PdfImageObject {
  content: PDFImage;
  width: number;
  height: number;
  hyperlink?: string;
  text?: string;
  textWidth?: number;
  textHeight?: number;
}
export interface DrawCenteredImagesParams {
  page: PDFPage;
  images: PdfImageObject[];
  pageWidth: number;
  pageHeight: number;
  paddingX?: number;
  gap?: number; // Gap between images if multiple are passed into the array.
  positionY?: number; // 0-1, vertical alignment, e.g. 0.5 is the center.
  annotateImage?: boolean; // renders image.text besides it
  font?: PDFFont;
}
