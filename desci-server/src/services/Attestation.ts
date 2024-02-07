import assert from 'assert';

import { AnnotationType, Prisma } from '@prisma/client';

import { prisma } from '../client.js';
import {
  AttestationNotFoundError,
  AttestationVersionNotFoundError,
  ClaimError,
  ClaimNotFoundError,
  CommunityNotFoundError,
  DuplicateClaimError,
  DuplicateDataError,
  DuplicateReactionError,
  DuplicateVerificationError,
  NoAccessError,
  VerificationError,
  VerificationNotFoundError,
} from '../internal.js';
import { communityService } from '../internal.js';

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
    const publishedNodeVersions = await prisma.nodeVersion.count({
      where: { nodeId: node.id, transactionId: { not: null } },
    });

    if (nodeVersion >= publishedNodeVersions) throw new ClaimError('Invalid Node version');

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
    if (exists) throw new DuplicateClaimError();

    return {
      attestationId: attestationVersionEntry.attestationId,
      attestationVersionId: attestationVersionEntry.id,
      desciCommunityId: attestationVersionEntry.attestation.communityId,
      nodeDpid10: nodeDpid,
      nodeUuid: node.uuid,
      nodeVersion,
      claimedById: claimedBy.id,
    };
  }

  async #publishVersion(attestationVersion: Prisma.AttestationVersionUncheckedCreateInput) {
    return prisma.attestationVersion.create({ data: attestationVersion });
  }

  async create(data: Prisma.AttestationUncheckedCreateInput) {
    const community = await communityService.findCommunityById(data.communityId);

    if (!community) throw new CommunityNotFoundError();

    const existing = await prisma.attestation.findUnique({ where: { name: data.name } });
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

  async getAttestationVersion(id: number, attestationId: number) {
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

  async addCommunitySelectedAttestation({
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

    const existingSelection = await prisma.communitySelectedAttestation.findFirst({
      where: { desciCommunityId: communityId, attestationId, attestationVersionId: attestationVersion.id },
    });
    if (existingSelection) throw new DuplicateDataError();

    return prisma.communitySelectedAttestation.create({
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
    return prisma.nodeAttestation.findMany({ where: { nodeDpid10: dpid }, include: { attestation: true } });
  }

  async getAllCommunityAttestations(communityId: number) {
    const community = await communityService.findCommunityById(communityId);
    if (!community) throw new CommunityNotFoundError();
    return prisma.attestation.findMany({ where: { communityId: communityId } });
  }

  async getCommunityEntryAttestations(communityId: number) {
    const community = await communityService.findCommunityById(communityId);
    if (!community) throw new CommunityNotFoundError();
    return prisma.communitySelectedAttestation.findMany({ where: { desciCommunityId: communityId, required: true } });
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

    const claim = await prisma.nodeAttestation.create({
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

    const claims = prisma.$transaction(data.map((data) => prisma.nodeAttestation.create({ data })));

    return claims;
  }

  async unClaimAttestation(id: number) {
    const claim = await prisma.nodeAttestation.findFirst({ where: { id } });
    if (!claim) throw new ClaimNotFoundError();
    return prisma.nodeAttestation.delete({ where: { id } });
  }

  async getNodeCommunityClaims(nodeDpid10: string, desciCommunityId: number) {
    return prisma.nodeAttestation.findMany({ where: { desciCommunityId, nodeDpid10 } });
  }
  async getClaimsOnAttestation(nodeDpid10: string, attestationId: number) {
    return prisma.nodeAttestation.findMany({ where: { attestationId, nodeDpid10 } });
  }
  async getClaimOnAttestationVersion(nodeDpid10: string, attestationId: number, attestationVersionId: number) {
    return prisma.nodeAttestation.findFirst({ where: { attestationId, nodeDpid10, attestationVersionId } });
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
    return prisma.nodeAttestationVerification.findMany({ where: { nodeAttestationId } });
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

  async removeReaction(id: number) {
    return prisma.nodeAttestationReaction.delete({
      where: { id },
    });
  }

  private async createAnnotation(data: Prisma.AnnotationUncheckedCreateInput) {
    return prisma.annotation.create({ data });
  }

  async createComment({ claimId, authorId, comment }: { claimId: number; authorId: number; comment: string }) {
    assert(authorId > 0, 'Error: authorId is zero');
    assert(claimId > 0, 'Error: claimId is zero');
    const data: Prisma.AnnotationUncheckedCreateInput = {
      type: AnnotationType.COMMENT,
      authorId,
      nodeAttestationId: claimId,
      body: comment,
    };
    return this.createAnnotation(data);
  }

  async createHighlight({ claimId, authorId, comment }: { claimId: number; authorId: number; comment: string }) {
    assert(authorId > 0, 'Error: authorId is zero');
    assert(claimId > 0, 'Error: claimId is zero');
    const data: Prisma.AnnotationUncheckedCreateInput = {
      type: AnnotationType.HIGHLIGHT,
      authorId,
      nodeAttestationId: claimId,
      body: comment,
    };
    return this.createAnnotation(data);
  }

  private async removeAnnotation(filter: Prisma.AnnotationWhereUniqueInput) {
    return prisma.annotation.delete({
      where: filter,
    });
  }

  async removeComment(commentId: number) {
    return prisma.annotation.delete({
      where: { id: commentId },
    });
  }

  async getReactions(filter: Prisma.NodeAttestationReactionWhereInput) {
    return prisma.nodeAttestationReaction.findMany({ where: filter });
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
}

export const attestationService = new AttestationService();
// export default attestationService;