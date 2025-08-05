import { ResearchObjectComponentType, ResearchObjectV1Author } from '@desci-labs/desci-models';
import _ from 'lodash';

import { prisma } from '../client.js';
import { IPFS_RESOLVER } from '../config/index.js';
import { NotFoundError } from '../core/ApiError.js';
import { getIndexedResearchObjects } from '../theGraph.js';
import { hexToCid } from '../utils.js';

import { getManifestByCid } from './data/processing.js';

export interface DpidMetadata {
  title: string;
  abstract: string;
  authors: ResearchObjectV1Author[];
  doi: string;
  publicationYear: number;
  publicationDate: string;
  pdfUrl: string;
}

export async function getDpidMetadata(dpid: number, version?: number): Promise<DpidMetadata> {
  const node = await prisma.node.findUnique({
    where: { dpidAlias: dpid },
    select: {
      uuid: true,
      dpidAlias: true,
      DoiRecord: {
        select: {
          doi: true,
        },
      },
    },
  });

  if (!node) {
    throw new NotFoundError(`No research object found for DPID: ${dpid}`);
  }

  const { researchObjects } = await getIndexedResearchObjects([node.uuid]);
  if (!researchObjects || researchObjects.length === 0) {
    throw new NotFoundError(`No published version found for DPID: ${dpid}`);
  }

  const doi = node.DoiRecord[0]?.doi;

  const researchObject = researchObjects[0];
  researchObject.versions.reverse();

  let targetVersionIndex = version ? version - 1 : researchObject.versions.length - 1;
  targetVersionIndex = _.clamp(targetVersionIndex, 0, researchObject.versions.length - 1);

  const targetVersion = researchObject.versions[targetVersionIndex];
  const targetVersionManifestCid = hexToCid(targetVersion.cid);
  const manifest = await getManifestByCid(targetVersionManifestCid);
  const pdfComponent = manifest.components.find(
    (component) =>
      component.starred === true &&
      (component.type === ResearchObjectComponentType.PDF ||
        component.name.endsWith('.pdf') ||
        component.payload?.path?.endsWith('.pdf')),
  );

  const date = targetVersion.time ? new Date(parseInt(targetVersion.time) * 1000) : undefined;
  const pubDate = date ? date.toLocaleDateString().split('/') : undefined;
  const metadata = {
    title: manifest.title,
    abstract: manifest.description,
    authors: manifest.authors,
    doi,
    publicationYear: targetVersion.time ? new Date(parseInt(targetVersion.time) * 1000).getFullYear() : undefined,
    publicationDate: pubDate ? `${pubDate[2]}/${pubDate[0]}/${pubDate[1]}` : undefined, // YYYY/MM/DD
    pdfUrl: pdfComponent ? `${IPFS_RESOLVER}/${pdfComponent.payload.cid}` : undefined,
    dpid: node.dpidAlias,
    version: targetVersionIndex + 1,
  };

  return metadata;
}
