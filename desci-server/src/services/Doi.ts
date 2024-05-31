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
import { getManifestByCid } from './data/processing.js';

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

  async assertHasValidatedAttestations(manifest: ResearchObjectV1) {
    const doiAttestations = await attestationService.getProtectedAttestations({
      protected: true,
      community: { slug: 'desci-foundation' },
    });
    logger.info(doiAttestations, 'DOI Requirements');
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

  async checkMintability(nodeUuid: string) {
    const uuid = ensureUuidEndsWithDot(nodeUuid);
    // check if node has claimed doi already
    await this.assertIsFirstDoi(uuid);

    // retrieve node manifest/metadata
    const { researchObjects } = await getIndexedResearchObjects([uuid]);
    const researchObject = researchObjects[0] as IndexedResearchObject;
    const manifestCid = hexToCid(researchObject.recentCid);
    const latestManifest = await getManifestByCid(manifestCid);
    researchObject.versions.reverse();

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
