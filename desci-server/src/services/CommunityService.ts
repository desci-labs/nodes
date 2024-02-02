import { Prisma } from '@prisma/client';

import { prisma } from '../client.js';

export class CommunityService {
  constructor() {}

  async new(community: Prisma.DesciCommunityCreateArgs) {
    const result = prisma.desciCommunity.create(community);
  }

  async newMember(communityId: number, member: Prisma.CommunityMemberCreateArgs) {
    // const result = prisma.desciCommunity.create(communty);
  }

  async findCommunityById(id: number) {
    return prisma.desciCommunity.findUnique({ where: { id } });
  }

  async updateCommunity(id: number, community: Prisma.DesciCommunityUpdateInput) {}

  async addMember(communityId: number, member: Prisma.CommunityMemberCreateInput) {}

  async removeMember(communityId: number, memberId: number) {}

  async addNodeToCommunityFeed(communityId: number, nodeUuid: string) {}
  async endorseNode(communityId: number, nodeFeedItemId: string) {}
  async removeEndorsement(communityId: number, nodeFeedItemEndorsementId: number) {}
  async getAllEndorsements(communityId: number) {}
  async getEndorsmentById(nodeFeedItemId: number) {}
}
