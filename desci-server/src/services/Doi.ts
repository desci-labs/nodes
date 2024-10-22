import { PdfComponent, ResearchObjectComponentType, ResearchObjectV1 } from '@desci-labs/desci-models';
import { DoiStatus, DoiSubmissionQueue, Prisma, PrismaClient } from '@prisma/client';
import { v4 } from 'uuid';

import {
  DuplicateMintError,
  BadManifestError,
  AttestationsError,
  MintError,
  ForbiddenMintError,
} from '../core/doi/error.js';
import { logger as parentLogger } from '../logger.js';
import { IndexedResearchObject, getIndexedResearchObjects } from '../theGraph.js';
import { asyncMap, ensureUuidEndsWithDot, hexToCid } from '../utils.js';

import { attestationService } from './Attestation.js';
import { WorkSelectOptions } from './crossRef/definitions.js';
import { getManifestByCid } from './data/processing.js';

import { crossRefClient } from './index.js';

const DOI_PREFIX = process.env.DOI_PREFIX;

if (!DOI_PREFIX) throw new Error('env DOI_PREFIX is missing!');

const logger = parentLogger.child({ module: '[DoiService]' });
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

  async assertHasValidatedAttestations(uuid: string) {
    const doiAttestations = await attestationService.getProtectedAttestations({
      protected: true,
      community: { slug: 'desci-foundation' },
    });
    // logger.info(doiAttestations, 'DOI Requirements');
    let claims = await attestationService.getProtectedNodeClaims(uuid);
    claims = claims.filter((claim) => claim.verifications > 0);

    const hasClaimedRequiredAttestation = doiAttestations.some((attestation) =>
      claims.find((claim) => claim.attestationId === attestation.id),
    );
    logger.info({ hasClaimedRequiredAttestation }, 'hasClaimedRequiredAttestation');
    if (!hasClaimedRequiredAttestation) throw new AttestationsError();
  }

  async extractManuscriptDoi(manuscripts: PdfComponent[]) {
    // todo: update this to use Grobid/openAlex
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
      const doi = works?.data?.message?.items.find((item) =>
        item.title.some((t) => t.toLowerCase() === manuscriptTitle.toLowerCase()),
      );
      logger.info({ status: works.ok, manuscript: manuscriptTitle, doi }, 'Search Manuscripts');

      if (!doi) return null;
      return { doi, component };
    });

    return manuscriptDois.filter(Boolean);
  }

  assertValidManifest(manifest: ResearchObjectV1) {
    const hasTitle = manifest.title.trim().length > 0;
    const hasAbstract = manifest?.description.trim().length > 0;
    const hasContributors = manifest.authors.length > 0;
    if (!hasTitle || !hasAbstract || !hasContributors) throw new BadManifestError();
  }

  // check mintability for either root node or manuscript
  async checkMintability(nodeUuid: string) {
    logger.info({ nodeUuid }, 'checkMintability');
    const uuid = ensureUuidEndsWithDot(nodeUuid);

    // retrieve node manifest/metadata
    const { researchObjects } = await getIndexedResearchObjects([uuid]);
    const researchObject = researchObjects[0] as IndexedResearchObject;
    logger.info({ researchObject, uuid }, 'RESEARCH OBJECT');
    if (!researchObject) throw new ForbiddenMintError('Node not published yet!');

    const manifestCid = hexToCid(researchObject?.recentCid);
    // if (!manifestCid) throw new ForbiddenMintError('Node not published yet!');

    const latestManifest = await getManifestByCid(manifestCid);
    researchObject.versions.reverse();

    // check if node has claimed doi already
    // check with dpid instead or dpid/path/to/manuscript or dpid/path/to/file
    const node = await this.dbClient.node.findFirst({
      where: { uuid: ensureUuidEndsWithDot(nodeUuid) },
      select: { dpidAlias: true },
    });
    logger.trace({ latestManifest, node }, 'Debug dpid');
    const dpid = latestManifest?.dpid?.id || node?.dpidAlias.toString();
    if (!dpid) {
      logger.error({ dpid, uuid }, 'checkMintability::No DPID found');
      throw new ForbiddenMintError('Node dpid not found');
    }
    await this.assertIsFirstDoi(dpid);

    // extract manuscripts
    const manuscripts = latestManifest.components.filter(
      (component) =>
        component.type === ResearchObjectComponentType.PDF ||
        component.name.endsWith('.pdf') ||
        component.payload?.path?.endsWith('.pdf'),
    ) as PdfComponent[];

    if (manuscripts.length > 0) {
      const existingDois = manuscripts.filter((doc) => doc.payload?.doi && doc.payload.doi.length > 0);

      // does manuscript(s) already have a DOI
      if (existingDois.length) {
        logger.trace({ existingDois }, 'Existing DOI');
        // Validate node has claimed all necessary attestations
        await this.assertHasValidatedAttestations(uuid);
      }
    } else {
      // Validate node has claimed all necessary attestations
      await this.assertHasValidatedAttestations(uuid);
    }

    // validate title, abstract and contributors
    this.assertValidManifest(latestManifest);

    return { dpid, uuid, manifest: latestManifest, researchObject };
  }

  async mintDoi(nodeUuid: string) {
    const { dpid, uuid, manifest, researchObject } = await this.checkMintability(nodeUuid);
    // mint new doi
    const doiSuffix = v4().substring(0, 8);
    const doi = `${DOI_PREFIX}/${doiSuffix}`;

    const latestVersion = researchObject.versions[researchObject.versions.length - 1];
    const publicationDate = new Date(parseInt(latestVersion.time) * 1000).toLocaleDateString().replaceAll('/', '-');

    const [month, day, year] = publicationDate.split('-');

    const metadataResponse = await crossRefClient.registerDoi({
      manifest,
      doi,
      dpid,
      publicationDate: { day, month, year },
    });

    logger.info({ doiSuffix, doi, uuid, metadataResponse }, 'DOI SUBMITTED');
    if (!metadataResponse.ok) {
      throw new MintError("We couldn't register a DOI for this research object");
    }

    // only create doi if submission status is success
    const submission = await crossRefClient.addSubmissiontoQueue({
      dpid,
      uuid: ensureUuidEndsWithDot(uuid),
      uniqueDoi: doi,
      batchId: metadataResponse.batchId,
    });

    // return submission queue data
    return submission;
  }

  /**
   * Query for Doi Record entry for a node using it's
   * identifier (dPid, uuid or Doi)
   * @param identifier dPID | UUID(.) | DOI
   * @returns
   */
  async findDoiRecord(identifier: string) {
    return this.dbClient.doiRecord.findFirst({
      where: { OR: [{ dpid: identifier }, { uuid: ensureUuidEndsWithDot(identifier) }, { doi: identifier }] },
    });
  }

  /**
   * List all registered Doi records
   */
  async listDoi() {
    return this.dbClient.doiRecord.findMany({ where: {} });
  }

  async hasPendingSubmission(uuid: string) {
    const pending = await this.dbClient.doiSubmissionQueue.findFirst({
      where: { uuid: ensureUuidEndsWithDot(uuid), status: DoiStatus.PENDING },
    });

    return pending;
  }

  async getPendingSubmission(batchId: string) {
    return await this.dbClient.doiSubmissionQueue.findFirst({
      where: { batchId, status: DoiStatus.PENDING },
    });
  }

  async getPendingSubmissions() {
    return await this.dbClient.doiSubmissionQueue.findMany({
      where: { status: DoiStatus.PENDING },
    });
  }

  async updateSubmission(
    filter: Prisma.DoiSubmissionQueueWhereInput,
    data: Prisma.DoiSubmissionQueueUncheckedUpdateManyInput,
  ) {
    return await this.dbClient.doiSubmissionQueue.updateMany({ where: filter, data });
  }

  async onRegistrationSuccessful(submission: DoiSubmissionQueue) {
    const doiRecord = await this.dbClient.doiRecord.create({
      data: {
        uuid: submission.uuid,
        dpid: submission.dpid,
        doi: submission.uniqueDoi,
      },
    });
    await this.updateSubmission(
      { id: submission.id },
      {
        status: DoiStatus.SUCCESS,
        doiRecordId: doiRecord.id,
      },
    );
  }
}
