import { Node } from '@prisma/client';
import axios from 'axios';

import { prisma } from '../client.js';
import { logger as parentLogger } from '../logger.js';

import { pinFile } from './ipfs.js';

export type PrepareDistributionPdfParams = {
  pdfCid: string;
  codeAvailableDpid?: string;
  dataAvailableDpid?: string;
  node: Node; // Title extraction for now
  doi: string; // Temporary till we have DOI system operational
  dpid: string;
  title: string;
};

type PrepareDistributionPdfResult = {
  pdfCid: string;
} | null;

class PublishPackageService {
  private logger = parentLogger.child({ module: 'Services::PublishPackageService' });

  async prepareDistributionPdf({
    pdfCid,
    codeAvailableDpid,
    dataAvailableDpid,
    node,
    doi,
    title,
  }: PrepareDistributionPdfParams): Promise<PrepareDistributionPdfResult> {
    // Check if distro PDF already exists
    const existingDistributionPdf = await prisma.distributionPdfs.findFirst({
      where: { originalPdfCid: pdfCid },
    });

    if (existingDistributionPdf) {
      return { pdfCid: existingDistributionPdf.distPdfCid };
    }

    if (process.env.ISOLATED_MEDIA_SERVER_URL === undefined) {
      this.logger.error('process.env.ISOLATED_MEDIA_SERVER_URL is not defined');
      return null;
    }

    // Generate the PDF with the cover
    const coverPdfStream = await axios.post(
      `${process.env.ISOLATED_MEDIA_SERVER_URL}/v1/pdf/addCover`,
      { cid: pdfCid, doi, title, codeAvailableDpid, dataAvailableDpid },
      {
        responseType: 'stream',
      },
    );
    // Save it on IPFS
    const pinned = await pinFile(coverPdfStream.data);

    // Save it to the database
    await prisma.distributionPdfs.create({
      data: { originalPdfCid: pdfCid, distPdfCid: pinned.cid, nodeUuid: node.uuid },
    });

    // LATER: Add data ref

    // Return the CID
    return { pdfCid: pinned.cid };
  }
}

export const publishPackageService = new PublishPackageService();
