import { ResearchObjectV1 } from '@desci-labs/desci-models';
import { Node } from '@prisma/client';
import axios from 'axios';

import { prisma } from '../client.js';
import { logger as parentLogger } from '../logger.js';

import { attestationService } from './Attestation.js';
import { pinFile } from './ipfs.js';
import { publishServices } from './PublishServices.js';

export type PrepareDistributionPdfParams = {
  pdfCid: string;
  node: Node; // Title extraction for now
  doi: string; // Temporary till we have DOI system operational
  manifest: ResearchObjectV1;
  manifestCid: string;
};

type PrepareDistributionPdfResult = {
  pdfCid: string;
} | null;

class PublishPackageService {
  private logger = parentLogger.child({ module: 'Services::PublishPackageService' });

  async prepareDistributionPdf({
    pdfCid,
    node,
    doi,
    manifest,
    manifestCid,
  }: PrepareDistributionPdfParams): Promise<PrepareDistributionPdfResult> {
    // Check if distro PDF already exists
    const existingDistributionPdf = await prisma.distributionPdfs.findFirst({
      where: { originalPdfCid: pdfCid, manifestCid },
    });

    if (existingDistributionPdf) {
      return { pdfCid: existingDistributionPdf.distPdfCid };
    }

    if (process.env.ISOLATED_MEDIA_SERVER_URL === undefined) {
      this.logger.error('process.env.ISOLATED_MEDIA_SERVER_URL is not defined');
      return null;
    }

    const title = manifest.title;
    const dpid = manifest.dpid.id;
    const license = PublishPackageService.extractManuscriptLicense(manifest, pdfCid);
    const publishTime = await publishServices.retrieveBlockTimeByManifestCid(node.uuid, manifestCid);
    const publishDate = PublishPackageService.convertUnixTimestampToDate(publishTime);
    const authors = manifest.authors?.map((author) => author.name);

    const attestations = await attestationService.getAllNodeAttestations(dpid);

    const openCodeAttestation = attestations.find((a) => a.attestationId === 15);
    const openDataAttestation = attestations.find((a) => a.attestationId === 16);

    const attestationLinks = {
      ...(openCodeAttestation && {
        codeAvailableDpid: `https://beta.dpid.org/${dpid}/attestations/${openCodeAttestation.id}`,
      }),
      ...(openDataAttestation && {
        dataAvailableDpid: `https://beta.dpid.org/${dpid}/attestations/${openDataAttestation.id}`,
      }),
    };

    // Generate the PDF with the cover
    const coverPdfStream = await axios.post(
      `${process.env.ISOLATED_MEDIA_SERVER_URL}/v1/pdf/addCover`,
      { cid: pdfCid, doi, title, ...attestationLinks, dpid, license, publishDate, authors },
      {
        responseType: 'stream',
      },
    );
    // Save it on IPFS
    const pinned = await pinFile(coverPdfStream.data);

    // Save it to the database
    await prisma.distributionPdfs.create({
      data: { originalPdfCid: pdfCid, distPdfCid: pinned.cid, nodeUuid: node.uuid, manifestCid },
    });

    // LATER: Add data ref

    // Return the CID
    return { pdfCid: pinned.cid };
  }

  static convertUnixTimestampToDate(unixTimestamp: string): string {
    const date = new Date(Number(unixTimestamp) * 1000);
    const formattedDate = date.toLocaleString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
    return formattedDate;
  }

  static extractManuscriptLicense(manifest: ResearchObjectV1, manuscriptCid): string {
    const manuscriptComponent = manifest.components?.find(
      (c) => c.payload.url === manuscriptCid || c.payload.cid === manuscriptCid,
    );
    return manuscriptComponent.payload.licenseType ?? manifest.defaultLicense;
  }
}

export const publishPackageService = new PublishPackageService();

export type GeneratePdfCoverRequestBody = {
  cid: string;
  doi: string;
  title: string;
  dpid?: string;
  codeAvailableDpid?: string;
  dataAvailableDpid?: string;
  authors?: string[];
  license: string;
  publishDate: string;
};
