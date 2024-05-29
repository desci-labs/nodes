import {
  PdfComponent,
  ResearchObjectComponentDocumentSubtype,
  ResearchObjectComponentType,
} from '@desci-labs/desci-models';
import { PrismaClient } from '@prisma/client';
import { v4 } from 'uuid';

import { DuplicateMintError, NoManuscriptError, BadManifestError, AttestationsError } from '../core/doi/error.js';
import { logger } from '../logger.js';
import { IndexedResearchObject, getIndexedResearchObjects } from '../theGraph.js';
import { ensureUuidEndsWithDot, hexToCid } from '../utils.js';

import { attestationService } from './Attestation.js';
import { communityService } from './Communities.js';
import { getManifestByCid } from './data/processing.js';

export class DoiService {
  dbClient: PrismaClient;

  constructor(prismaClient: PrismaClient) {
    this.dbClient = prismaClient;
  }

  async checkMintability(nodeUuid: string) {
    const uuid = ensureUuidEndsWithDot(nodeUuid);
    // check if node has claimed doi already
    const exists = await this.dbClient.doiRecord.findUnique({ where: { uuid } });
    if (exists) throw new DuplicateMintError();

    // retrieve node manifest/metadata
    const { researchObjects } = await getIndexedResearchObjects([uuid]);
    const researchObject = researchObjects[0] as IndexedResearchObject;
    const manifestCid = hexToCid(researchObject.recentCid);
    const latestManifest = await getManifestByCid(manifestCid);
    researchObject.versions.reverse();
    // const nodeVersion = researchObject.versions.length;

    const doiAttestations = await attestationService.getProtectedAttestations({
      protected: true,
      community: { slug: 'desci-foundation' },
    });
    logger.info(doiAttestations, 'DOI Requirements');
    let claims = await attestationService.getProtectedNodeClaims(latestManifest.dpid.id);
    claims = claims.filter((claim) => claim.verifications > 0);
    const hasDataOrCode = claims.length > 0;

    // check if manuscript is included
    const manuscript =
      latestManifest &&
      latestManifest.components.find(
        (component) =>
          component.type === ResearchObjectComponentType.PDF &&
          (component as PdfComponent).subtype === ResearchObjectComponentDocumentSubtype.MANUSCRIPT,
      );
    if (!manuscript && !hasDataOrCode) {
      throw new NoManuscriptError();
    }

    // validate title, abstract and contributors
    const hasTitle = latestManifest.title.trim().length > 0;
    const hasAbstract = latestManifest.description.trim().length > 0;
    const hasContributors = latestManifest.authors.length > 0;
    if (!hasTitle || !hasAbstract || !hasContributors) throw new BadManifestError();

    const hasClaimedRequiredAttestations = doiAttestations.every((attestation) =>
      claims.find((claim) => claim.attestationId === attestation.id),
    );
    if (!hasClaimedRequiredAttestations) throw new AttestationsError();

    return { dpid: latestManifest.dpid.id, uuid };
  }

  async mintDoi(nodeUuid: string) {
    const { dpid, uuid } = await this.checkMintability(nodeUuid);
    // todo: handle over logic to cross-ref api service for minting DOIs
    // mint new doi
    const doiSuffix = v4().substring(0, 8);
    const doi = `https://doi.org/10.555/${doiSuffix}`;
    logger.info({ doiSuffix, doi, uuid }, 'MINT DOI');
    return await this.dbClient.doiRecord.create({
      data: {
        uuid,
        dpid,
        doi,
      },
    });
  }

  async getDoiByDpidOrUuid(identifier: string) {
    return this.dbClient.doiRecord.findFirst({
      where: { OR: [{ dpid: identifier }, { uuid: ensureUuidEndsWithDot(identifier) }] },
    });
  }
}
