import { CommunityMembershipRole, DesciCommunity, NodeFeedItem, Prisma } from '@prisma/client';

import { prisma } from '../client.js';
import { DuplicateDataError } from '../core/communities/error.js';

export class CommunityService {
  async createCommunity(data: Prisma.DesciCommunityCreateManyInput) {
    const exists = await prisma.desciCommunity.findFirst({ where: { name: data.name } });

    if (exists) {
      throw new DuplicateDataError('Community name taken!');
    }

    const community = await prisma.desciCommunity.create({ data: data });
    return community;
  }

  async getCommunityAdmin(communityId: number) {
    return prisma.communityMember.findFirst({
      where: { communityId, role: CommunityMembershipRole.ADMIN },
      include: { user: true },
    });
  }

  async #addCommunityMember(communityId: number, data: Prisma.CommunityMemberCreateManyInput) {
    const existingMember = await this.findMemberByUserId(communityId, data.userId);
    if (existingMember) return existingMember;
    return prisma.communityMember.create({ data: data });
  }

  async findCommunityById(id: number) {
    return prisma.desciCommunity.findUnique({ where: { id } });
  }

  async findCommunityByName(name: string) {
    return prisma.desciCommunity.findUnique({ where: { name } });
  }

  async updateCommunity(name: string, community: Prisma.DesciCommunityUpdateInput) {
    return prisma.desciCommunity.upsert({
      where: { name },
      create: {
        name: community.name as string,
        description: community.description as string,
        // image_url: community.image_url as string,
      },
      update: community,
    });
  }

  async getAllMembers(communityId: number) {
    return await prisma.communityMember.findMany({ where: { communityId, role: CommunityMembershipRole.MEMBER } });
  }

  async findMemberByUserId(communityId: number, userId: number) {
    return await prisma.communityMember.findUnique({ where: { userId_communityId: { userId, communityId } } });
  }

  async removeMember(communityId: number, userId: number) {
    return prisma.communityMember.delete({ where: { userId_communityId: { userId, communityId } } });
  }

  async createOrFindNodeFeedItem({
    dPID,
    nodeFeedItem,
  }: {
    // communityId: number;
    dPID: string;
    nodeFeedItem: Prisma.NodeFeedItemCreateManyInput;
  }) {
    // const node = await prisma.node.findFirst({ where: { uuid: dPID } });
    const existingFeed = await prisma.nodeFeedItem.findFirst({ where: { nodeDpid10: dPID } });
    let nodeFeed: NodeFeedItem;
    if (!existingFeed) {
      nodeFeed = await prisma.nodeFeedItem.create({ data: nodeFeedItem });
    }
    return nodeFeed;
  }

  async getNodeFeedByDpid(nodeDpid10: string) {
    return prisma.nodeFeedItem.findUnique({ where: { nodeDpid10 } });
  }

  async endorseNodeByDpid({
    communityId,
    dPID,
    userId,
    nodeFeedItem,
  }: {
    communityId: number;
    userId: number;
    dPID: string;
    nodeFeedItem: Prisma.NodeFeedItemCreateManyInput;
  }) {
    const feedItem = await this.createOrFindNodeFeedItem({ nodeFeedItem, dPID });
    const endorsement = await prisma.nodeFeedItemEndorsement.create({
      data: { nodeDpid10: dPID, type: '', userId, nodeFeedItemId: feedItem.id, desciCommunityId: communityId },
    });
    return endorsement;
  }

  async removeEndorsementById(desciCommunityId: number, nodeFeedItemEndorsementId: number) {
    const endorsement = await prisma.nodeFeedItemEndorsement.findFirst({
      where: { id: nodeFeedItemEndorsementId, desciCommunityId },
    });
    if (endorsement) return prisma.nodeFeedItemEndorsement.delete({ where: { id: nodeFeedItemEndorsementId } });
    return false;
  }

  async removeNodeEndorsementByDpid(desciCommunityId: number, dPID: string) {
    const endorsement = await prisma.nodeFeedItemEndorsement.findFirst({
      where: { desciCommunityId, nodeDpid10: dPID },
    });
    if (endorsement) {
      return prisma.nodeFeedItemEndorsement.delete({ where: { id: endorsement.id } });
    }
    return true;
  }

  async getAllCommunityEndorsements(desciCommunityId: number) {
    return prisma.nodeFeedItemEndorsement.findMany({ where: { desciCommunityId } });
  }

  async getAllUserEndorsements(userId: number) {
    return prisma.nodeFeedItemEndorsement.findMany({ where: { userId } });
  }

  async getAllNodeEndorsementsByDpid(dpid: string) {
    return prisma.nodeFeedItemEndorsement.findMany({ where: { nodeFeedItem: { nodeDpid10: dpid } } });
  }

  async getAllUserCommunityEndorsements(desciCommunityId: number, userId: number) {
    return prisma.nodeFeedItemEndorsement.findMany({ where: { desciCommunityId, userId } });
  }

  async getEndorsmentById(id: number) {
    return prisma.nodeFeedItemEndorsement.findFirst({ where: { id } });
  }
}

const communityService = new CommunityService();
export default communityService;
