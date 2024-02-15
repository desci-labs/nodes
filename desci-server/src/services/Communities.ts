import { Attestation, CommunityMembershipRole, NodeAttestation, NodeFeedItem, Prisma } from '@prisma/client';
import _ from 'lodash';

import { prisma } from '../client.js';
import { DuplicateDataError } from '../internal.js';
import { attestationService } from '../internal.js';

export type CommunityRadarNode = NodeAttestation & { annotations: number; reactions: number; verifications: number };
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

  private async addCommunityMember(communityId: number, data: Prisma.CommunityMemberCreateManyInput) {
    const existingMember = await this.findMemberByUserId(communityId, data.userId);
    if (existingMember) return existingMember;
    return prisma.communityMember.create({ data: data });
  }

  async findCommunityById(id: number) {
    return prisma.desciCommunity.findUnique({ where: { id } });
  }

  async getCommunities() {
    return prisma.desciCommunity.findMany();
  }

  async findCommunityByNameOrSlug(name: string) {
    return prisma.desciCommunity.findFirst({ where: { OR: [{ name }, { slug: name }] } });
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

  /**
   * This query retrieves data from the "NodeAttestation" table along with the counts of related records from the
   * "Annotation", "NodeAttestationReaction", and "NodeAttestationVerification" tables.
   * It uses left outer joins to include all records from the "NodeAttestation" table,
   * even if there are no related records in the other tables. The WHERE clause filters
   * the results based on the "desciCommunityId" column.
   * The EXISTS subquery checks if there is a matching record in the "CommunitySelectedAttestation" table based on certain conditions.
   * Finally, t he results are grouped by the "id" column of the "NodeAttestation" table.
   * @param communityId
   * @returns
   */
  async getCommunityRadar(communityId: number) {
    const entryAttestations = await attestationService.getCommunityEntryAttestations(communityId);
    const selectedClaims = (await prisma.$queryRaw`
      SELECT t1.*,
      count(DISTINCT "Annotation".id)::int AS annotations,
      count(DISTINCT "NodeAttestationReaction".id)::int AS reactions,
      count(DISTINCT "NodeAttestationVerification".id)::int AS verifications
      FROM "NodeAttestation" t1
        left outer JOIN "Annotation" ON t1."id" = "Annotation"."nodeAttestationId"
        left outer JOIN "NodeAttestationReaction" ON t1."id" = "NodeAttestationReaction"."nodeAttestationId"
        left outer JOIN "NodeAttestationVerification" ON t1."id" = "NodeAttestationVerification"."nodeAttestationId"
      WHERE t1."desciCommunityId" = ${communityId}
        AND
        EXISTS
      (SELECT *
        from "CommunitySelectedAttestation" c1
        where t1."attestationId" = c1."attestationId" and t1."attestationVersionId" = c1."attestationVersionId" and c1."desciCommunityId" = t1."desciCommunityId")
        GROUP BY
  		t1.id
    `) as CommunityRadarNode[];

    // console.log({ selectedClaims });
    const radar = _(selectedClaims)
      .groupBy((x) => x.nodeDpid10)
      .map((value: CommunityRadarNode[], key: string) => ({
        NodeAttestation: value,
        nodeDpid10: key,
        nodeuuid: value[0].nodeUuid,
      }))
      .filter((entry) => entry.NodeAttestation.length === entryAttestations.length)
      .value();
    return radar;
  }

  async getCuratedNodes(communityId: number) {
    const nodesOnRadar = await this.getCommunityRadar(communityId);
    const curated = nodesOnRadar.filter((node) =>
      node.NodeAttestation.every((attestation) => attestation.verifications > 0),
    );
    return curated;
  }

  async getCommunityEngagementSignals(communityId: number) {
    const claims = (await prisma.$queryRaw`
      SELECT t1.*,
      count(DISTINCT "Annotation".id)::int AS annotations,
      count(DISTINCT "NodeAttestationReaction".id)::int AS reactions,
      count(DISTINCT "NodeAttestationVerification".id)::int AS verifications
      FROM "NodeAttestation" t1
        left outer JOIN "Annotation" ON t1."id" = "Annotation"."nodeAttestationId"
        left outer JOIN "NodeAttestationReaction" ON t1."id" = "NodeAttestationReaction"."nodeAttestationId"
        left outer JOIN "NodeAttestationVerification" ON t1."id" = "NodeAttestationVerification"."nodeAttestationId"
      WHERE t1."desciCommunityId" = ${communityId}
        GROUP BY
  		t1.id
    `) as CommunityRadarNode[];

    // console.log({ claims });
    const groupedEngagements = claims.reduce(
      (total, claim) => ({
        reactions: total.reactions + claim.reactions,
        annotations: total.annotations + claim.annotations,
        verifications: total.verifications + claim.verifications,
      }),
      { reactions: 0, annotations: 0, verifications: 0 },
    );
    // console.log({ groupedEngagements });
    return groupedEngagements;
  }

  /**
   * Returns all community engagement signals for a node
   * @param communityId
   * @param dpid
   * @returns
   */
  async getNodeCommunityEngagementSignals(communityId: number, dpid: string) {
    const claims = (await prisma.$queryRaw`
      SELECT t1.*,
      count(DISTINCT "Annotation".id)::int AS annotations,
      count(DISTINCT "NodeAttestationReaction".id)::int AS reactions,
      count(DISTINCT "NodeAttestationVerification".id)::int AS verifications
      FROM "NodeAttestation" t1
        left outer JOIN "Annotation" ON t1."id" = "Annotation"."nodeAttestationId"
        left outer JOIN "NodeAttestationReaction" ON t1."id" = "NodeAttestationReaction"."nodeAttestationId"
        left outer JOIN "NodeAttestationVerification" ON t1."id" = "NodeAttestationVerification"."nodeAttestationId"
      WHERE t1."desciCommunityId" = ${communityId} AND t1."nodeDpid10" = ${dpid}
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

  private async getAllMembers(communityId: number) {
    return await prisma.communityMember.findMany({ where: { communityId, role: CommunityMembershipRole.MEMBER } });
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
    dPID: string;
    nodeFeedItem: Prisma.NodeFeedItemCreateManyInput;
  }) {
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
