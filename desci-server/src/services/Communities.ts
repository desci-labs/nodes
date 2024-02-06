import { CommunityMembershipRole, NodeAttestation, NodeFeedItem, Prisma } from '@prisma/client';
import _ from 'lodash';

import { prisma } from '../client.js';
import { DuplicateDataError } from '../internal.js';
import { attestationService } from '../internal.js';
export class CommunityService {
  async createCommunity(data: Prisma.DesciCommunityCreateManyInput) {
    const exists = await prisma.desciCommunity.findFirst({ where: { name: data.name } });

    if (exists) {
      throw new DuplicateDataError('Community name taken!');
    }

    const community = await prisma.desciCommunity.create({ data: data });
    return community;
  }

  async getAllCommunities() {
    return prisma.desciCommunity.findMany({
      select: {
        id: true,
        name: true,
        image_url: true,
        description: true,
      },
    });
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
    return await prisma.communityMember.findMany({ where: { communityId }, select: { role: true, user: true } });
  }

  async getCommunityRadar(communityId: number) {
    const entryAttestations = await attestationService.getCommunityEntryAttestations(communityId);
    console.log({ entryAttestations });
    const selectedClaims = (await prisma.$queryRaw`
      SELECT *
      FROM "NodeAttestation" t1
      WHERE t1."desciCommunityId" = ${communityId}
        AND
        EXISTS (SELECT *
        from "CommunitySelectedAttestation" c1
        where t1."attestationId" = c1."attestationId" and t1."attestationVersionId" = c1."attestationVersionId" and c1."desciCommunityId" = t1."desciCommunityId")
    `) as NodeAttestation[];

    const entries = _(selectedClaims)
      .groupBy((x) => x.nodeDpid10)
      .map((value: NodeAttestation[], key: string) => ({
        NodeAttestation: value,
        nodeDpid10: key,
        nodeuuid: value[0].nodeUuid,
      }))
      .filter((entry) => entry.NodeAttestation.length === entryAttestations.length)
      .value();
    // console.log('Selected claims', { selectedClaims, entries });

    return entries;
  }

  private async findMemberByUserId(communityId: number, userId: number) {
    return await prisma.communityMember.findUnique({ where: { userId_communityId: { userId, communityId } } });
  }

  private async removeMember(communityId: number, userId: number) {
    return prisma.communityMember.delete({ where: { userId_communityId: { userId, communityId } } });
  }

  private async createOrFindNodeFeedItem({
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

  private async getNodeFeedByDpid(nodeDpid10: string) {
    return prisma.nodeFeedItem.findUnique({ where: { nodeDpid10 } });
  }

  private async endorseNodeByDpid({
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

  private async removeEndorsementById(desciCommunityId: number, nodeFeedItemEndorsementId: number) {
    const endorsement = await prisma.nodeFeedItemEndorsement.findFirst({
      where: { id: nodeFeedItemEndorsementId, desciCommunityId },
    });
    if (endorsement) return prisma.nodeFeedItemEndorsement.delete({ where: { id: nodeFeedItemEndorsementId } });
    return false;
  }

  private async removeNodeEndorsementByDpid(desciCommunityId: number, dPID: string) {
    const endorsement = await prisma.nodeFeedItemEndorsement.findFirst({
      where: { desciCommunityId, nodeDpid10: dPID },
    });
    if (endorsement) {
      return prisma.nodeFeedItemEndorsement.delete({ where: { id: endorsement.id } });
    }
    return true;
  }

  private async getAllCommunityEndorsements(desciCommunityId: number) {
    return prisma.nodeFeedItemEndorsement.findMany({ where: { desciCommunityId } });
  }

  private async getAllUserEndorsements(userId: number) {
    return prisma.nodeFeedItemEndorsement.findMany({ where: { userId } });
  }

  private async getAllNodeEndorsementsByDpid(dpid: string) {
    return prisma.nodeFeedItemEndorsement.findMany({ where: { nodeFeedItem: { nodeDpid10: dpid } } });
  }

  private async getAllUserCommunityEndorsements(desciCommunityId: number, userId: number) {
    return prisma.nodeFeedItemEndorsement.findMany({ where: { desciCommunityId, userId } });
  }

  private async getEndorsmentById(id: number) {
    return prisma.nodeFeedItemEndorsement.findFirst({ where: { id } });
  }
}

export const communityService = new CommunityService();
