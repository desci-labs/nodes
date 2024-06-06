import { PdfComponent, ResearchObjectComponentType, ResearchObjectV1 } from '@desci-labs/desci-models';
import { PrismaClient } from '@prisma/client';
import { v4 } from 'uuid';

import { DuplicateMintError, BadManifestError, AttestationsError } from '../core/doi/error.js';
import { logger } from '../logger.js';
import { IndexedResearchObject, getIndexedResearchObjects } from '../theGraph.js';
import { asyncMap, ensureUuidEndsWithDot, hexToCid } from '../utils.js';

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

  async assertIsFirstDoi(dpid: string) {
    const isFirstDoi = await this.isFirstDoi(dpid);
    if (!isFirstDoi) throw new DuplicateMintError();
  }

  async isFirstDoi(dpid: string) {
    const exists = await this.dbClient.doiRecord.findUnique({ where: { dpid } });
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

  async extractManuscriptDoi(manuscripts: PdfComponent[]) {
    const manuscriptDois = await asyncMap(manuscripts, async (component) => {
      const manuscriptTitle =
        component.name.replace(/\.pdf/g, '') ||
        component.payload.title ||
        component.payload.path.split('/').pop().replace(/\.pdf/g, '');
      // check if manuscripts have doi assigned already
      const works = await crossRefClient.listWorks({
        rows: 5,
        select: [WorkSelectOptions.DOI, WorkSelectOptions.TITLE, WorkSelectOptions.AUTHOR],
        queryTitle: manuscriptTitle,
      });
      const doi = works?.data?.message?.items.find((item) => item.title === manuscriptTitle);
      logger.info({ status: works.ok, manuscript: manuscriptTitle, doi }, 'Search Manuscripts');

      if (!doi) return null;
      return { doi, component };
    });

    return manuscriptDois.filter(Boolean);
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
    await this.assertIsFirstDoi(latestManifest.dpid.id);

    // extract manuscripts
    const manuscripts = latestManifest.components.filter(
      (component) =>
        component.type === ResearchObjectComponentType.PDF ||
        component.name.endsWith('.pdf') ||
        component.payload?.path?.endsWith('.pdf'),
    ) as PdfComponent[];
    logger.info(manuscripts, 'MANUSCRIPTS');

    if (manuscripts.length > 0) {
      const existingDois = await this.extractManuscriptDoi(manuscripts);

      logger.info(existingDois, 'Existing DOI');
      // does manuscript(s) already have a DOI
      if (existingDois.length) {
        // Validate node has claimed all necessary attestations
        await this.assertHasValidatedAttestations(latestManifest);
      }
    } else {
      // Validate node has claimed all necessary attestations
      await this.assertHasValidatedAttestations(latestManifest);
    }

    // validate title, abstract and contributors
    this.assertValidManifest(latestManifest);

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
