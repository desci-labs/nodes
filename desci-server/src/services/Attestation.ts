import assert from 'assert';

import { HighlightBlock } from '@desci-labs/desci-models';
import { AnnotationType, Attestation, NodeAttestation, Prisma } from '@prisma/client';
import { logger } from 'ethers';
import _ from 'lodash';

import { prisma } from '../client.js';
import {
  AttestationNotFoundError,
  AttestationVersionNotFoundError,
  ClaimNotFoundError,
  CommunityNotFoundError,
  CommunityRadarNode,
  DuplicateClaimError,
  DuplicateDataError,
  DuplicateReactionError,
  DuplicateVerificationError,
  NoAccessError,
  VerificationError,
  VerificationNotFoundError,
} from '../internal.js';
import { communityService } from '../internal.js';

export type AllAttestation = Attestation & {
  annotations: number;
  reactions: number;
  verifications: number;
  communitySelected: boolean;
  communityName: boolean;
  communityImageurl: boolean;
  communityDescription: boolean;
};
export type CommunityAttestation = Attestation & {
  required: boolean;
  annotations: number;
  reactions: number;
  verifications: number;
  communitySelected: boolean;
};

/**
 * Attestation Service
 * Handles Business logic for attestations, Node Attestations,
 * Claiming, reactions and comments
 */
export class AttestationService {
  // constructor() {}

  async #checkClaimAttestationQuery({
    attestationId,
    attestationVersion,
    nodeDpid,
    nodeUuid,
    nodeVersion,
    claimerId,
  }: {
    attestationId: number;
    attestationVersion: number;
    nodeVersion: number;
    nodeUuid: string;
    nodeDpid: string;
    claimerId: number;
  }) {
    const attestationVersionEntry = await this.getAttestationVersion(attestationVersion, attestationId);
    if (!attestationVersionEntry) throw new AttestationVersionNotFoundError();

    const node = await prisma.node.findFirst({ where: { uuid: nodeUuid } });
    const publishedNodeVersions =
      (await prisma.$queryRaw`SELECT COUNT(*) from "NodeVersion" where "nodeId" = ${node.id} AND "transactionId" IS NOT NULL`) as number;

    if (nodeVersion >= publishedNodeVersions) {
      logger.warn({ nodeVersion, publishedNodeVersions }, 'Invalid Node version');
      // throw new ClaimError('Invalid Node version');
    }

    const claimedBy = await prisma.user.findUnique({ where: { id: claimerId } });
    if (!claimedBy) throw new NoAccessError('ClaimedBy user not found');

    const exists = await prisma.nodeAttestation.findFirst({
      where: {
        attestationId,
        attestationVersionId: attestationVersionEntry.id,
        desciCommunityId: attestationVersionEntry.attestation.communityId,
        nodeDpid10: nodeDpid,
        nodeVersion,
      },
    });
    if (exists && exists.revoked === false) throw new DuplicateClaimError();
    logger.info({ exists }, '#CheckClaimAttestationQuery');

    return {
      attestationId: attestationVersionEntry.attestationId,
      attestationVersionId: attestationVersionEntry.id,
      desciCommunityId: attestationVersionEntry.attestation.communityId,
      nodeDpid10: nodeDpid,
      nodeUuid: node.uuid,
      nodeVersion,
      claimedById: claimedBy.id,
      revoked: exists?.revoked || false,
      revokedId: exists?.id,
    };
  }

  async #publishVersion(attestationVersion: Prisma.AttestationVersionUncheckedCreateInput) {
    return prisma.attestationVersion.create({ data: attestationVersion });
  }

  async create(data: Prisma.AttestationUncheckedCreateInput) {
    const community = await communityService.findCommunityById(data.communityId);

    if (!community) throw new CommunityNotFoundError();

    const existing = await prisma.attestation.findFirst({ where: { name: data.name, communityId: data.communityId } });
    if (existing) throw new DuplicateDataError();

    const attestation = await prisma.attestation.create({ data: { communityId: community.id, ...data } });

    await this.#publishVersion({
      name: attestation.name,
      description: attestation.description,
      image_url: attestation.image_url,
      attestationId: attestation.id,
    });

    return attestation;
  }

  async createAttestationFromTemplate(
    templateName: string,
    communityId: number,
    override: Partial<Prisma.AttestationCreateInput>,
  ) {
    const template = await prisma.attestationTemplate.findUnique({ where: { name: templateName } });
    if (!template) throw new AttestationNotFoundError(`Attestation Template ${templateName} not found`);

    return this.create({
      communityId,
      templateId: template.id,
      name: override.name,
      description: override.description || template.description,
      image_url: override.image_url || template.image_url,
    });
  }

  async createTemplate(template: Prisma.AttestationTemplateCreateManyInput) {
    const exist = await prisma.attestationTemplate.findUnique({ where: { name: template.name } });
    if (exist) throw new DuplicateDataError();
    return prisma.attestationTemplate.create({ data: template });
  }

  async updateAttestation(attestationId: number, data: Prisma.AttestationUncheckedCreateInput) {
    const attestation = await this.findAttestationById(attestationId);

    if (!attestation) throw new AttestationNotFoundError();

    await this.#publishVersion({
      name: data.name as string,
      description: data.description,
      image_url: data.image_url,
      attestationId: attestation.id,
    });
    const updated = await this.findAttestationById(attestation.id);
    return updated;
  }

  async findAttestationById(id: number) {
    return prisma.attestation.findUnique({ where: { id }, include: { AttestationVersion: true } });
  }

  async getAttestationVersions(attestationId: number) {
    return prisma.attestationVersion.findMany({ where: { attestationId } });
  }

  private async getAttestationVersion(id: number, attestationId: number) {
    return prisma.attestationVersion.findFirst({
      where: { attestationId, id },
      include: { attestation: { select: { communityId: true } } },
    });
  }

  async getAttestationVersionNumber(attestationId: number) {
    const attestation = await this.findAttestationById(attestationId);
    if (!attestation) throw new AttestationNotFoundError();
    return attestation.AttestationVersion.length;
  }

  async addCommunityEntryAttestation({
    communityId,
    attestationId,
    attestationVersion: version,
  }: {
    communityId: number;
    attestationId: number;
    attestationVersion: number;
  }) {
    const community = await communityService.findCommunityById(communityId);
    if (!community) throw new CommunityNotFoundError();

    const attestationVersion = await prisma.attestationVersion.findFirst({
      where: { attestationId, id: version },
    });
    if (!attestationVersion) throw new AttestationVersionNotFoundError();

    const existingSelection = await prisma.communityEntryAttestation.findFirst({
      where: { desciCommunityId: communityId, attestationId, attestationVersionId: attestationVersion.id },
    });
    if (existingSelection) throw new DuplicateDataError();

    return prisma.communityEntryAttestation.create({
      data: {
        desciCommunityId: communityId,
        attestationId: attestationVersion.attestationId,
        attestationVersionId: attestationVersion.id,
        required: true,
      },
      include: { attestationVersion: true, attestation: true },
    });
  }

  async getAllNodeAttestations(dpid: string) {
    return prisma.nodeAttestation.findMany({
      where: { nodeDpid10: dpid, revoked: false },
      include: {
        community: { select: { name: true, description: true, keywords: true, image_url: true } },
        attestationVersion: { select: { name: true, description: true, image_url: true } },
        node: { select: { ownerId: true } },
        // NodeAttestationReaction: { s},
        _count: {
          select: { Annotation: true, NodeAttestationReaction: true, NodeAttestationVerification: true },
        },
      },
    });
  }

  async getNodeCommunityAttestations(dpid: string, communityId: number) {
    return prisma.nodeAttestation.findMany({
      where: { nodeDpid10: dpid, desciCommunityId: communityId, revoked: false },
      include: {
        community: { select: { name: true, description: true, keywords: true } },
        attestationVersion: { select: { name: true, description: true, image_url: true } },
        node: { select: { ownerId: true } },
        // NodeAttestationReaction: { s},
        _count: {
          select: { Annotation: true, NodeAttestationReaction: true, NodeAttestationVerification: true },
        },
      },
    });
  }

  // async getAllCommunityAttestations(communityId: number) {
  //   const community = await communityService.findCommunityById(communityId);
  //   if (!community) throw new CommunityNotFoundError();
  //   return prisma.attestation.findMany({ where: { communityId: communityId } });
  // }

  async getCommunityEntryAttestations(communityId: number) {
    const community = await communityService.findCommunityById(communityId);
    if (!community) throw new CommunityNotFoundError();
    return prisma.communityEntryAttestation.findMany({ where: { desciCommunityId: communityId, required: true } });
  }

  async claimAttestation({
    attestationId,
    attestationVersion,
    nodeDpid,
    nodeUuid,
    nodeVersion,
    claimerId,
  }: {
    attestationId: number;
    attestationVersion: number;
    nodeVersion: number;
    nodeUuid: string;
    nodeDpid: string;
    claimerId: number;
  }) {
    const data = await this.#checkClaimAttestationQuery({
      attestationId,
      attestationVersion,
      nodeDpid,
      nodeUuid,
      nodeVersion,
      claimerId,
    });
    const claim = data.revoked
      ? await this.reClaimAttestation(data.revokedId)
      : await prisma.nodeAttestation.create({
          data,
        });

    return claim;
  }

  async canClaimAttestation({
    attestationId,
    attestationVersion,
    nodeDpid,
    nodeUuid,
    nodeVersion,
    claimerId,
  }: {
    attestationId: number;
    attestationVersion: number;
    nodeVersion: number;
    nodeUuid: string;
    nodeDpid: string;
    claimerId: number;
  }) {
    try {
      await this.#checkClaimAttestationQuery({
        attestationId,
        attestationVersion,
        nodeDpid,
        nodeUuid,
        nodeVersion,
        claimerId,
      });
      return true;
    } catch (err) {
      return false;
    }
  }

  async claimAttestations({
    attestations,
    nodeDpid,
    nodeUuid,
    nodeVersion,
    claimerId,
  }: {
    attestations: { attestationId: number; attestationVersion: number }[];
    nodeVersion: number;
    nodeUuid: string;
    nodeDpid: string;
    claimerId: number;
  }) {
    const data = await Promise.all(
      attestations.map(({ attestationId, attestationVersion }) =>
        this.#checkClaimAttestationQuery({
          attestationId,
          attestationVersion,
          nodeDpid,
          nodeUuid,
          nodeVersion,
          claimerId,
        }),
      ),
    );

    const reclaimCandidates: typeof data = [];
    const inserts: Prisma.NodeAttestationUncheckedCreateInput[] = [];
    for (const entry of data) {
      if (entry.revoked) reclaimCandidates.push(entry);
      else inserts.push(entry);
    }

    logger.info({ reclaimCandidates, inserts }, 'Batch claim');
    const claims = await prisma.$transaction(inserts.map((data) => prisma.nodeAttestation.create({ data })));
    const reclaims = await Promise.all(reclaimCandidates.map((entry) => this.reClaimAttestation(entry.revokedId)));

    return [...claims, ...reclaims];
  }

  // todo: remove and update tests
  async unClaimAttestation(id: number) {
    const claim = await prisma.nodeAttestation.findFirst({ where: { id } });
    if (!claim) throw new ClaimNotFoundError();
    const deleted = await prisma.$transaction([
      prisma.annotation.deleteMany({ where: { nodeAttestationId: id } }),
      prisma.nodeAttestationReaction.deleteMany({ where: { nodeAttestationId: id } }),
      prisma.nodeAttestationVerification.deleteMany({ where: { nodeAttestationId: id } }),
      prisma.nodeAttestation.delete({ where: { id } }),
    ]);
    return deleted[3];
  }

  async revokeAttestation(id: number) {
    const claim = await prisma.nodeAttestation.findFirst({ where: { id } });
    if (!claim) throw new ClaimNotFoundError();
    const { id: claimId, ...create } = claim;
    return await prisma.nodeAttestation.upsert({
      create,
      update: { revoked: true, revokedAt: new Date().toISOString() },
      where: { id },
    });
  }

  async reClaimAttestation(id: number) {
    const claim = await prisma.nodeAttestation.findFirst({ where: { id } });
    if (!claim) throw new ClaimNotFoundError();
    const { id: claimId, ...create } = claim;
    return await prisma.nodeAttestation.upsert({
      create,
      update: { revoked: false, revokedAt: null },
      where: { id },
    });
  }

  async getNodeCommunityClaims(nodeDpid10: string, desciCommunityId: number) {
    return prisma.nodeAttestation.findMany({ where: { desciCommunityId, nodeDpid10 } });
  }

  async getClaimOnAttestationVersion(nodeDpid10: string, attestationId: number, attestationVersionId: number) {
    return prisma.nodeAttestation.findFirst({ where: { attestationId, nodeDpid10, attestationVersionId } });
  }

  async getClaimOnDpid(id: number, nodeDpid10: string) {
    return prisma.nodeAttestation.findFirst({ where: { id, nodeDpid10 } });
  }

  async verifyClaim(nodeAttestationId: number, userId: number) {
    assert(nodeAttestationId > 0, 'Error: nodeAttestationId is Zero');
    assert(userId > 0, 'Error: userId is Zero');

    const claim = await this.findClaimById(nodeAttestationId);
    if (!claim) throw new ClaimNotFoundError();

    const node = await prisma.node.findFirst({ where: { uuid: claim.nodeUuid } });
    if (node.ownerId === userId) throw new VerificationError('Node author cannot verify claim');

    const exists = await prisma.nodeAttestationVerification.findFirst({ where: { nodeAttestationId, userId } });
    if (exists) throw new DuplicateVerificationError();

    return prisma.nodeAttestationVerification.create({ data: { nodeAttestationId, userId } });
  }

  async findVerificationById(id: number) {
    return prisma.nodeAttestationVerification.findFirst({ where: { id } });
  }

  async removeVerification(id: number, userId: number) {
    const verification = await prisma.nodeAttestationVerification.findFirst({ where: { id, userId } });
    if (!verification) throw new VerificationNotFoundError();
    return prisma.nodeAttestationVerification.delete({ where: { id } });
  }

  async getUserClaimVerification(nodeAttestationId: number, userId: number) {
    assert(nodeAttestationId > 0, 'Error: nodeAttestationId is zero');
    assert(userId > 0, 'Error: UserId is zero');
    return prisma.nodeAttestationVerification.findFirst({ where: { nodeAttestationId, userId } });
  }

  async getAllClaimVerfications(nodeAttestationId: number) {
    assert(nodeAttestationId > 0);
    return prisma.nodeAttestationVerification.findMany({ where: { nodeAttestationId }, include: { user: true } });
  }

  async findClaimById(id: number) {
    return prisma.nodeAttestation.findFirst({ where: { id } });
  }

  async getAllNodeVerfications(nodeUuid: string) {
    return prisma.nodeAttestationVerification.findMany({
      where: { nodeAttestation: { nodeUuid } },
      include: { nodeAttestation: true },
    });
  }

  async createReaction({ claimId, userId: authorId, reaction }: { claimId: number; userId: number; reaction: string }) {
    assert(authorId > 0, 'Error: authorId is Zero');
    const claim = await this.findClaimById(claimId);
    if (!claim) throw new ClaimNotFoundError();

    const duplicate = await prisma.nodeAttestationReaction.findFirst({
      where: { nodeAttestationId: claim.id, authorId, reaction },
    });

    if (duplicate) throw new DuplicateReactionError();

    return prisma.nodeAttestationReaction.create({ data: { authorId, reaction, nodeAttestationId: claimId } });
  }

  async findReaction(filter: Prisma.NodeAttestationReactionWhereInput) {
    return prisma.nodeAttestationReaction.findFirst({
      where: filter,
    });
  }
  async removeReaction(id: number) {
    return prisma.nodeAttestationReaction.delete({
      where: { id },
    });
  }

  private async createAnnotation(data: Prisma.AnnotationUncheckedCreateInput) {
    return prisma.annotation.create({ data });
  }

  async createComment({
    claimId,
    authorId,
    comment,
    links,
  }: {
    claimId: number;
    authorId: number;
    comment: string;
    links: string[];
  }) {
    assert(authorId > 0, 'Error: authorId is zero');
    assert(claimId > 0, 'Error: claimId is zero');
    const data: Prisma.AnnotationUncheckedCreateInput = {
      type: AnnotationType.COMMENT,
      authorId,
      nodeAttestationId: claimId,
      body: comment,
      links,
    };
    return this.createAnnotation(data);
  }

  async createHighlight({
    claimId,
    authorId,
    comment,
    highlights,
    links,
  }: {
    claimId: number;
    authorId: number;
    comment: string;
    links: string[];
    highlights: HighlightBlock[];
  }) {
    assert(authorId > 0, 'Error: authorId is zero');
    assert(claimId > 0, 'Error: claimId is zero');
    const data: Prisma.AnnotationUncheckedCreateInput = {
      type: AnnotationType.HIGHLIGHT,
      authorId,
      nodeAttestationId: claimId,
      body: comment,
      links,
      highlights: highlights.map((h) => JSON.stringify(h)),
    };
    return this.createAnnotation(data);
  }

  async removeComment(commentId: number) {
    return prisma.annotation.delete({
      where: { id: commentId },
    });
  }

  async getReactions(filter: Prisma.NodeAttestationReactionWhereInput) {
    return prisma.nodeAttestationReaction.findMany({ where: filter, include: { author: true } });
  }

  async getUserClaimReactions(claimId: number, authorId: number) {
    assert(authorId > 0, 'Error: authorId is zero');
    assert(claimId > 0, 'Error: claimId is zero');
    const filter: Prisma.NodeAttestationReactionWhereInput = {
      authorId,
      nodeAttestationId: claimId,
    };
    return this.getReactions(filter);
  }

  async getAnnotations(filter: Prisma.AnnotationWhereInput) {
    return prisma.annotation.findMany({ where: filter });
  }

  async findAnnotationById(id: number) {
    return prisma.annotation.findUnique({ where: { id } });
  }

  async getUserClaimComments(claimId: number, authorId: number) {
    assert(authorId > 0, 'Error: authorId is zero');
    assert(claimId > 0, 'Error: claimId is zero');
    const filter: Prisma.AnnotationWhereInput = { authorId, nodeAttestationId: claimId, type: AnnotationType.COMMENT };
    return this.getAnnotations(filter);
  }

  async getUserClaimHighlights(claimId: number, authorId: number) {
    assert(authorId > 0, 'Error: authorId is zero');
    assert(claimId > 0, 'Error: claimId is zero');
    const filter: Prisma.AnnotationWhereInput = {
      authorId,
      nodeAttestationId: claimId,
      type: AnnotationType.HIGHLIGHT,
    };
    return this.getAnnotations(filter);
  }

  async getAllClaimAnnotations(nodeAttestationId: number) {
    assert(nodeAttestationId > 0, 'Error: nodeAttestationId is zero');
    return this.getAnnotations({ nodeAttestationId });
  }

  async getAllClaimReactions(nodeAttestationId: number) {
    assert(nodeAttestationId > 0, 'Error: nodeAttestationId is zero');
    return this.getReactions({ nodeAttestationId });
  }

  // TODO: write raw sql query to optimize this
  async getAllClaimComments(filter: Prisma.AnnotationWhereInput) {
    return prisma.annotation.findMany({
      where: filter,
      include: {
        author: true,
        attestation: {
          include: {
            attestationVersion: { select: { name: true, description: true, image_url: true, createdAt: true } },
          },
        },
      },
    });
  }

  /**
   * List all attestations and their engagements metrics across all claimed attestations
   * @returns AttestationWithEngagement[]
   */
  async listAll() {
    const queryResult = (await prisma.$queryRaw`
    SELECT
      A.*,
      COUNT(distinct AN.id)::int AS annotations,
      COUNT(distinct NAR.id)::int AS reactions,
      COUNT(distinct NAV.id)::int AS verifications,
      CASE
        WHEN CSA.id IS NOT NULL THEN TRUE
        ELSE FALSE
      END AS "communitySelected",
      DC.id AS "communityId",
      DC.name AS "communityName",
      DC.description AS "communityDescription",
      DC.image_url AS "communityImageurl",
      DC.keywords AS "communityKeywords"
    FROM
      "Attestation" A
      LEFT JOIN "NodeAttestation" NA ON NA."attestationId" = A.id AND NA."revoked" = false
      LEFT JOIN "Annotation" AN ON AN."nodeAttestationId" = NA.id
      LEFT JOIN "NodeAttestationReaction" NAR ON NAR."nodeAttestationId" = NA.id
      LEFT JOIN "NodeAttestationVerification" NAV ON NAV."nodeAttestationId" = NA.id
      LEFT JOIN "DesciCommunity" DC ON DC.id = A."communityId"
      LEFT JOIN "CommunityEntryAttestation" CSA ON CSA."desciCommunityId" = A."communityId"
	    AND CSA."attestationId" = A.id
    GROUP BY
      A.id,
      CSA.id,
      DC.id
      `) as AllAttestation[];

    return queryResult;
  }

  async getRecommendedAttestations() {
    const attestations = await prisma.communityEntryAttestation.findMany({
      include: {
        attestation: { select: { community: true } },
        attestationVersion: {
          select: {
            name: true,
            description: true,
            image_url: true,
          },
        },
        desciCommunity: { select: { name: true, hidden: true } },
      },
      where: {
        desciCommunity: {
          hidden: false,
        },
      },
    });

    return attestations;
  }

  /**
   * Query to return all entry attestations of a community  and their engagements metrics across all claimed attestations
   * Join rows from their community and prefix with ccommunity
   * @param communityId
   * @returns AttestationWithEngagement[]
   */
  async listCommunityEntryAttestations(communityId: number) {
    const queryResult = (await prisma.$queryRaw`
     SELECT
      A.*,
      COUNT(distinct AN.id)::int AS annotations,
      COUNT(distinct NAR.id)::int AS reactions,
      COUNT(distinct NAV.id)::int AS verifications,
      CASE
        WHEN CSA.id IS NOT NULL THEN TRUE
        ELSE FALSE
      END AS "communitySelected"
    FROM
      "Attestation" A
      LEFT JOIN "NodeAttestation" NA ON NA."attestationId" = A.id AND NA."revoked" = false
      LEFT JOIN "Annotation" AN ON AN."nodeAttestationId" = NA.id
      LEFT JOIN "NodeAttestationReaction" NAR ON NAR."nodeAttestationId" = NA.id
      LEFT JOIN "NodeAttestationVerification" NAV ON NAV."nodeAttestationId" = NA.id
      LEFT JOIN "CommunityEntryAttestation" CSA ON CSA."attestationId" = A."id"
	where 
		CSA."desciCommunityId" = ${communityId}
    GROUP BY
      A.id,
      CSA.id
      `) as CommunityAttestation[];

    return queryResult;
  }

  /**
   * Returns all engagement signals for a node across all claimed attestations
   * This verification signal is the number returned for the verification field
   * @param dpid
   * @returns
   */
  async getNodeEngagementSignals(dpid: string) {
    const claims = (await prisma.$queryRaw`
      SELECT t1.*,
      count(DISTINCT "Annotation".id)::int AS annotations,
      count(DISTINCT "NodeAttestationReaction".id)::int AS reactions,
      count(DISTINCT "NodeAttestationVerification".id)::int AS verifications
      FROM "NodeAttestation" t1
        left outer JOIN "Annotation" ON t1."id" = "Annotation"."nodeAttestationId"
        left outer JOIN "NodeAttestationReaction" ON t1."id" = "NodeAttestationReaction"."nodeAttestationId"
        left outer JOIN "NodeAttestationVerification" ON t1."id" = "NodeAttestationVerification"."nodeAttestationId"
      WHERE t1."nodeDpid10" = ${dpid} AND t1."revoked" = false
        GROUP BY
  		t1.id
    `) as CommunityRadarNode[];

    const groupedEngagements = claims.reduce(
      (total, claim) => ({
        reactions: total.reactions + claim.reactions,
        annotations: total.annotations + claim.annotations,
        verifications: total.verifications + claim.verifications,
      }),
      { reactions: 0, annotations: 0, verifications: 0 },
    );
    return groupedEngagements;
  }
  /**
   * Returns all engagement signals for a claimed attestation
   * @param claimId
   * @returns
   */
  async getClaimEngagementSignals(claimId: number) {
    const claim = (await prisma.$queryRaw`
      SELECT t1.*,
      count(DISTINCT "Annotation".id)::int AS annotations,
      count(DISTINCT "NodeAttestationReaction".id)::int AS reactions,
      count(DISTINCT "NodeAttestationVerification".id)::int AS verifications
      FROM "NodeAttestation" t1
        left outer JOIN "Annotation" ON t1."id" = "Annotation"."nodeAttestationId"
        left outer JOIN "NodeAttestationReaction" ON t1."id" = "NodeAttestationReaction"."nodeAttestationId"
        left outer JOIN "NodeAttestationVerification" ON t1."id" = "NodeAttestationVerification"."nodeAttestationId"
      WHERE t1."id" = ${claimId}
        GROUP BY
  		t1.id
    `) as CommunityRadarNode[];

    const signal = claim.reduce(
      (total, claim) => ({
        reactions: total.reactions + claim.reactions,
        annotations: total.annotations + claim.annotations,
        verifications: total.verifications + claim.verifications,
      }),
      { reactions: 0, annotations: 0, verifications: 0 },
    );
    return signal;
  }

  /**
   * Returns all verification signals for a node across all claimed entry attestations from a community {communityId}
   * This community verification signal is the number returned for the verification field
   * @param communityId {number}
   * @param dpid {string}
   * @returns
   */
  async getNodeCommunityVerificationSignals(communityId: number, dpid: string) {
    const claims = (await prisma.$queryRaw`
      SELECT t1.*,
      count(DISTINCT "Annotation".id)::int AS annotations,
      count(DISTINCT "NodeAttestationReaction".id)::int AS reactions,
      count(DISTINCT "NodeAttestationVerification".id)::int AS verifications
      FROM "NodeAttestation" t1
        left outer JOIN "Annotation" ON t1."id" = "Annotation"."nodeAttestationId"
        left outer JOIN "NodeAttestationReaction" ON t1."id" = "NodeAttestationReaction"."nodeAttestationId"
        left outer JOIN "NodeAttestationVerification" ON t1."id" = "NodeAttestationVerification"."nodeAttestationId"
      WHERE t1."nodeDpid10" = ${dpid}
      AND
        EXISTS
      (SELECT *
        from "CommunityEntryAttestation" c1
        where t1."attestationId" = c1."attestationId" and t1."attestationVersionId" = c1."attestationVersionId" and c1."desciCommunityId" = ${communityId})
        GROUP BY
  		t1.id
    `) as CommunityRadarNode[];

    const groupedEngagements = claims.reduce(
      (total, claim) => ({
        reactions: total.reactions + claim.reactions,
        annotations: total.annotations + claim.annotations,
        verifications: total.verifications + claim.verifications,
      }),
      { reactions: 0, annotations: 0, verifications: 0 },
    );
    return groupedEngagements;
  }

  /**
   * Returns all engagement signals for an attestations
   * This verification signal is the number returned for the verification field
   * @param attestationId
   * @param attestationVersionId
   * @returns
   */
  async getAttestationVersionEngagementSignals(attestationId: number, attestationVersionId: number) {
    const claims = (await prisma.$queryRaw`
      SELECT t1.*,
      count(DISTINCT "Annotation".id)::int AS annotations,
      count(DISTINCT "NodeAttestationReaction".id)::int AS reactions,
      count(DISTINCT "NodeAttestationVerification".id)::int AS verifications
      FROM "NodeAttestation" t1
        left outer JOIN "Annotation" ON t1."id" = "Annotation"."nodeAttestationId"
        left outer JOIN "NodeAttestationReaction" ON t1."id" = "NodeAttestationReaction"."nodeAttestationId"
        left outer JOIN "NodeAttestationVerification" ON t1."id" = "NodeAttestationVerification"."nodeAttestationId"
      WHERE t1."attestationId" = ${attestationId} AND t1."attestationVersionId" = ${attestationVersionId}
        GROUP BY
  		t1.id
    `) as CommunityRadarNode[];

    const groupedEngagements = claims.reduce(
      (total, claim) => ({
        reactions: total.reactions + claim.reactions,
        annotations: total.annotations + claim.annotations,
        verifications: total.verifications + claim.verifications,
      }),
      { reactions: 0, annotations: 0, verifications: 0 },
    );
    return groupedEngagements;
  }

  /**
   * Returns all engagement signals for an attestations
   * This verification signal is the number returned for the verification field
   * @param attestationId
   * @returns
   */
  async getAttestationEngagementSignals(attestationId: number) {
    const claims = (await prisma.$queryRaw`
      SELECT t1.*,
      count(DISTINCT "Annotation".id)::int AS annotations,
      count(DISTINCT "NodeAttestationReaction".id)::int AS reactions,
      count(DISTINCT "NodeAttestationVerification".id)::int AS verifications
      FROM "NodeAttestation" t1
        left outer JOIN "Annotation" ON t1."id" = "Annotation"."nodeAttestationId"
        left outer JOIN "NodeAttestationReaction" ON t1."id" = "NodeAttestationReaction"."nodeAttestationId"
        left outer JOIN "NodeAttestationVerification" ON t1."id" = "NodeAttestationVerification"."nodeAttestationId"
      WHERE t1."attestationId" = ${attestationId} AND t1."revoked" = false
        GROUP BY
  		t1.id
    `) as CommunityRadarNode[];

    const groupedEngagements = claims.reduce(
      (total, claim) => ({
        reactions: total.reactions + claim.reactions,
        annotations: total.annotations + claim.annotations,
        verifications: total.verifications + claim.verifications,
      }),
      { reactions: 0, annotations: 0, verifications: 0 },
    );
    return groupedEngagements;
  }
}

export const attestationService = new AttestationService();
// export default attestationService;
