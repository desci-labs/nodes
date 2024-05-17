import crypto from 'node:crypto';

import {
  PdfComponent,
  ResearchObjectComponentDocumentSubtype,
  ResearchObjectComponentType,
} from '@desci-labs/desci-models';
import { PrismaClient } from '@prisma/client';

import { IndexedResearchObject, getIndexedResearchObjects } from '../theGraph.js';
import { ensureUuidEndsWithDot, hexToCid } from '../utils.js';

import { attestationService } from './Attestation.js';
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

    const doiAttestations = await attestationService.getProtectedAttestations({ protected: true });
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
    const doiSuffix = crypto.randomBytes(8 - dpid.length);
    const doi = `https://doi.org/10.555/${doiSuffix}`;
    return await this.dbClient.doiRecord.create({
      data: {
        uuid,
        dpid,
        doi,
      },
    });
  }

  async checkDataOrCode(dpid: string) {}
}

export enum DoiErrorType {
  DUPLICATE_MINT = 'DuplicateDoiError',
  NO_MANUSCRIPT = 'NoManuscriptError',
  BAD_METADATA = 'InvalidManifestError',
  INCOMPLETE_ATTESTATIONS = 'ForbiddenError',
}

export class DoiError extends Error {
  name = 'DoiValidationError';

  constructor(
    public type: DoiErrorType,
    public message: string = 'Doi Error',
  ) {
    super(type);
  }
}

export class BadManifestError extends DoiError {
  constructor(message = 'Title, Abstract or Contributors is missing') {
    super(DoiErrorType.BAD_METADATA, message);
  }
}

export class NoManuscriptError extends DoiError {
  constructor(message = 'Node has no manuscript') {
    super(DoiErrorType.NO_MANUSCRIPT, message);
  }
}

export class AttestationsError extends DoiError {
  constructor(message = 'All required attestations are not claimed or verified!') {
    super(DoiErrorType.INCOMPLETE_ATTESTATIONS, message);
  }
}

export class DuplicateMintError extends DoiError {
  constructor(message = 'DOI already minted for node') {
    super(DoiErrorType.DUPLICATE_MINT, message);
  }
}
