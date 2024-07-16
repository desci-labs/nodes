import { ResearchObjectV1 } from '@desci-labs/desci-models';
import { Node } from '@prisma/client';
import axios from 'axios';

import { prisma } from '../client.js';
import { logger as parentLogger } from '../logger.js';
import { ensureUuidEndsWithDot, toKebabCase } from '../utils.js';

import { attestationService } from './Attestation.js';
import { pinFile } from './ipfs.js';
import { publishServices } from './PublishServices.js';
import { CidString, HeightPx } from './Thumbnails.js';

export type PrepareDistributionPdfParams = {
  pdfCid: string;
  node: Node; // Title extraction for now
  doi?: string; // Temporary till we have DOI system operational
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
    this.logger.trace({ pdfCid, nodeUuid: node.uuid, doi, manifest, manifestCid }, 'Preparing distribution PDF');
    // Check if distro PDF already exists
    const existingDistributionPdf = await prisma.distributionPdfs.findFirst({
      where: { originalPdfCid: pdfCid, manifestCid },
    });

    // debugger;
    if (existingDistributionPdf) {
      return { pdfCid: existingDistributionPdf.distPdfCid };
    }

    if (process.env.ISOLATED_MEDIA_SERVER_URL === undefined) {
      this.logger.error('process.env.ISOLATED_MEDIA_SERVER_URL is not defined');
      return null;
    }
    // debugger;
    const title = manifest.title;
    const demoMode = manifest?.dpid?.id === undefined;
    const dpid = !demoMode ? manifest?.dpid?.id : 'UNPUBLISHED_DEMO';
    if (dpid === undefined) {
      this.logger.warn({ dpid, nodeId: node.id }, 'Failed generating a publish package for node, dpid is undefined');
      throw new Error('DPID is undefined');
    }

    const license = PublishPackageService.extractManuscriptLicense(manifest, pdfCid);
    let nodeUuid = ensureUuidEndsWithDot(node.uuid);
    nodeUuid = nodeUuid.slice(0, -1);
    // const paddedTimestamp = unixTimestamp.padEnd(13, '0');
    const publishTime = demoMode
      ? Date.now().toString().slice(0, 10)
      : await publishServices.retrieveBlockTimeByManifestCid(nodeUuid, manifestCid);

    const publishDate = PublishPackageService.convertUnixTimestampToDate(publishTime);
    const authors = manifest.authors?.map((author) => author.name);

    const attestations = await attestationService.getAllNodeAttestations(nodeUuid);

    const openCodeAttestation = attestations.find((a) => a.attestationVersion.name === 'Open Code');
    const openDataAttestation = attestations.find((a) => a.attestationVersion.name === 'Open Data');

    const dpidUrl = process.env.DPID_URL_OVERRIDE ?? 'https://beta.dpid.org';
    const attestationLinks = {
      ...(openCodeAttestation && {
        codeAvailableDpid: `${dpidUrl}/${dpid}/attestations/${toKebabCase(openCodeAttestation.attestationVersion.name)}`,
      }),
      ...(openDataAttestation && {
        dataAvailableDpid: `${dpidUrl}/${dpid}/attestations/${toKebabCase(openDataAttestation.attestationVersion.name)}`,
      }),
    };

    // Generate the PDF with the cover
    this.logger.trace({ pdfCid, doi, title, dpid, license, publishDate, authors }, 'Generating PDF cover');
    const coverPdfStream = await axios.post(
      `${process.env.ISOLATED_MEDIA_SERVER_URL}/v1/pdf/addCover`,
      { cid: pdfCid, doi, title, ...attestationLinks, dpid, license, publishDate, authors },
      {
        responseType: 'stream',
      },
    );

    this.logger.trace({ pdfCid, doi, title, dpid, license, publishDate, authors }, 'Generated PDF cover');
    // Save it on IPFS
    const pinned = await pinFile(coverPdfStream.data);

    this.logger.trace({ pdfCid, doi, title, dpid, license, publishDate, authors }, 'Pinned PDF cover');
    // Save it to the database
    await prisma.distributionPdfs.create({
      data: { originalPdfCid: pdfCid, distPdfCid: pinned.cid, nodeUuid: node.uuid, manifestCid },
    });

    // LATER: Add data ref

    this.logger.trace(
      { pdfCid, doi, title, dpid, license, publishDate, authors, pinnedCid: pinned.cid },
      'Saved PDF cover',
    );

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
      (c) => c.payload?.url === manuscriptCid || c.payload?.cid === manuscriptCid,
    );
    return manuscriptComponent?.payload?.licenseType ?? manifest.defaultLicense;
  }

  async generatePdfPreview(
    pdfCid: CidString,
    heightPx: HeightPx,
    pageNums: PageNumber[],
    nodeUuid: string,
  ): Promise<PreviewMap> {
    this.logger.trace({ pdfCid, heightPx, pageNums, nodeUuid }, 'Generating PDF preview');
    if (process.env.ISOLATED_MEDIA_SERVER_URL === undefined) {
      this.logger.error('process.env.ISOLATED_MEDIA_SERVER_URL is not defined');
      return null;
    }

    // debugger;
    // Generate the preview
    const previewResponse = await axios.post(
      `${process.env.ISOLATED_MEDIA_SERVER_URL}/v1/pdf/previews?height=${heightPx}`,
      { cid: pdfCid, pages: pageNums },
      {
        responseType: 'json',
      },
    );

    this.logger.trace({ pdfCid, heightPx, pageNums, nodeUuid }, 'Generated PDF preview');

    const previewStreams = previewResponse.data;

    const previewMap: PreviewMap = {};

    for (let i = 0; i < previewStreams.length; i++) {
      const pageNumber = pageNums[i];
      // debugger;
      const previewStream = previewStreams[i];
      // Save it on IPFS
      const pinned = await pinFile(previewStream.data);

      previewMap[pageNumber] = pinned.cid;
    }

    this.logger.trace({ pdfCid, heightPx, pageNums, nodeUuid, previewMap }, 'Pinned PDF preview');

    // Save it to the database
    // const existingPreviews = await prisma.pdfPreviews.findFirst({
    //   where: { pdfCid, nodeUuid },
    // });

    // if (existingPreviews) {
    //   await prisma.pdfPreviews.update({
    //     where: { id: existingPreviews.id },
    //     data: { previewMap },
    //   });
    // } else {
    //   await prisma.pdfPreviews.create({
    //     data: { nodeUuid: ensureUuidEndsWithDot(nodeUuid), pdfCid, previewMap },
    //   });
    // }

    // LATER: Add data ref
    return previewMap;
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

export enum PREVIEW_TYPE {
  FRONTMATTER = 'frontmatter',
  CONTENT = 'content',
}

export type PageNumber = number;
export type PreviewMap = Record<PageNumber, CidString>;
