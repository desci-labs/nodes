import { Prisma } from '@prisma/client';

import { prisma } from '../client.js';

export class AttestationService {
  constructor() {}

  async create(communityId: number) {
    // const result = prisma.attestation.create();
  }

  async publishVersion(attestationId: number, attestationVersion: Prisma.AttestationVersionCreateInput) {
    // const result = prisma.desciCommunity.create(communty);
  }

  async findAttestationById(id: number) {
    return prisma.desciCommunity.findUnique({ where: { id } });
  }
  async addCommunitySelectedAttestation(communityId: number, attestationId: number) {}
  async getAllCommunityAttestations(communityId: number) {}
  async getCommunityEntryAttestations(communityId: number) {}
  async claimAttestation(attestationId: number, nodeUuid: string) {}
  async claimAttestations(attestationIds: number[], nodeUuid: string) {}
  async verifyAttestation(nodeAttestationId: number, userId: number) {}
  async getAllAttestationVerfication(nodeAttestationId: number) {}
  async getAllAttestationAnnotations(nodeAttestationId: number) {}
  async getAllAttestationReactions(nodeAttestationId: number) {}
  async getAllAttestationComments(nodeAttestationId: number) {}
  async unVerifyAttestation(nodeAttestationId: number, userId: number) {}
  async getUserAttestationVerification(nodeAttestationId: number, userId: number) {}
  async createReaction(nodeAttestationId: number, reaction: Prisma.NodeAttestationReactionCreateInput) {}
  async removeReaction(nodeAttestationId: number, reaction: Prisma.NodeAttestationReactionCreateInput) {}
  async getUserAttestationReactions(nodeAttestationId: number, userId: number) {}
  async createComment(nodeAttestationId: number, comment: Prisma.AnnotationCreateInput) {}
  async removeComment(nodeAttestationId: number, commentId: number) {}
  async getUserAttestationComments(nodeAttestationId: number, userId: number) {}
}
