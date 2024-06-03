import {
  PdfComponent,
  ResearchObjectComponentDocumentSubtype,
  ResearchObjectComponentType,
  ResearchObjectV1,
} from '@desci-labs/desci-models';
import { PrismaClient } from '@prisma/client';
import { v4 } from 'uuid';

import { DuplicateMintError, NoManuscriptError, BadManifestError, AttestationsError } from '../core/doi/error.js';
import { logger } from '../logger.js';
import { IndexedResearchObject, getIndexedResearchObjects } from '../theGraph.js';
import { ensureUuidEndsWithDot, hexToCid } from '../utils.js';

import { attestationService } from './Attestation.js';
import { WorkSelectOptions } from './crossRef/definitions.js';
import { getManifestByCid } from './data/processing.js';

import { crossRefClient } from './index.js';

const DOI_PREFIX = process.env.DOI_PREFIX;

if (!DOI_PREFIX) throw new Error('env DOI_PREFIX is missing!');
export class DoiService {
  dbClient: PrismaClient;

  constructor(prismaClient: PrismaClient) {
    this.dbClient = prismaClient;
  }

  async assertIsFirstDoi(uuid: string) {
    const exists = await this.dbClient.doiRecord.findUnique({ where: { uuid } });
    if (exists) throw new DuplicateMintError();
  }

  async isFirstDoi(uuid: string) {
    const exists = await this.dbClient.doiRecord.findUnique({ where: { uuid } });
    // if (exists) throw new DuplicateMintError();
    return !exists;
  }

  async assertHasValidatedAttestations(manifest: ResearchObjectV1) {
    const doiAttestations = await attestationService.getProtectedAttestations({
      protected: true,
      community: { slug: 'desci-foundation' },
    });
    // logger.info(doiAttestations, 'DOI Requirements');
    let claims = await attestationService.getProtectedNodeClaims(manifest.dpid.id);
    claims = claims.filter((claim) => claim.verifications > 0);

    const hasClaimedRequiredAttestations = doiAttestations.every((attestation) =>
      claims.find((claim) => claim.attestationId === attestation.id),
    );
    if (!hasClaimedRequiredAttestations) throw new AttestationsError();
  }

  assertHasValidManuscript(manifest: ResearchObjectV1) {
    const manuscript =
      manifest &&
      manifest.components.find(
        (component) =>
          component.type === ResearchObjectComponentType.PDF &&
          (component as PdfComponent).subtype === ResearchObjectComponentDocumentSubtype.MANUSCRIPT,
      );
    if (!manuscript) {
      throw new NoManuscriptError();
    }
  }

  assertValidManifest(manifest: ResearchObjectV1) {
    const hasTitle = manifest.title.trim().length > 0;
    const hasAbstract = manifest.description.trim().length > 0;
    const hasContributors = manifest.authors.length > 0;
    if (!hasTitle || !hasAbstract || !hasContributors) throw new BadManifestError();
  }

  // check mintability for either root node or manuscript
  async checkMintability(nodeUuid: string) {
    const uuid = ensureUuidEndsWithDot(nodeUuid);

    // retrieve node manifest/metadata
    const { researchObjects } = await getIndexedResearchObjects([uuid]);
    const researchObject = researchObjects[0] as IndexedResearchObject;
    const manifestCid = hexToCid(researchObject.recentCid);
    const latestManifest = await getManifestByCid(manifestCid);
    researchObject.versions.reverse();

    // check if node has claimed doi already
    // check with dpid instead or dpid/path/to/manuscript or dpid/path/to/file
    await this.assertIsFirstDoi(latestManifest.dpid.id || uuid);

    // extract manuscripts
    const manuscriptTitle = 'Guidelines for Evaluating the Comparability of Down-Sampled GWAS Summary Statistics';
    // check if manuscripts have doi assigned already
    const works = await crossRefClient.listWorks({
      rows: 1,
      select: [WorkSelectOptions.DOI, WorkSelectOptions.TITLE, WorkSelectOptions.AUTHOR],
      queryTitle: manuscriptTitle,
    });
    const doi = works?.data?.message?.items.find((item) => item.title === manuscriptTitle);
    logger.info(works, 'Search Manuscript');
    logger.info(doi, 'Existing DOI');
    // * if none has doi
    // * - check if root node has validatedAttestations
    // * - if not return silently
    // * - return { dpid }

    // manuscript has doi
    // check validated attributes
    // * if yes
    // ** assertValidManifest
    // * return { dpid }

    // check if manuscript is included
    this.assertHasValidManuscript(latestManifest);

    // validate title, abstract and contributors
    this.assertValidManifest(latestManifest);

    await this.assertHasValidatedAttestations(latestManifest);

    return { dpid: latestManifest.dpid.id, uuid };
  }

  async mintDoi(nodeUuid: string) {
    const { dpid, uuid } = await this.checkMintability(nodeUuid);
    // todo: handle over logic to cross-ref api service for minting DOIs
    // mint new doi
    const doiSuffix = v4().substring(0, 8);
    const doi = `${DOI_PREFIX}/${doiSuffix}`;
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
