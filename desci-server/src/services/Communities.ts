import { Attestation, CommunityMembershipRole, NodeAttestation, NodeFeedItem, Prisma } from '@prisma/client';
import _, { includes } from 'lodash';

import { prisma } from '../client.js';
import { DuplicateDataError, logger } from '../internal.js';
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

  async adminGetCommunities() {
    return prisma.desciCommunity.findMany({
      orderBy: { createdAt: 'asc' },
      include: {
        CommunityMember: {
          select: { id: true, role: true, userId: true, user: { select: { name: true, userOrganizations: true } } },
          orderBy: { role: 'asc' },
        },
        CommunityEntryAttestation: {
          select: { id: true, attestationVersion: { select: { id: true, name: true, image_url: true } } },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
  }

  async adminGetAttestations(where?: Prisma.AttestationWhereInput) {
    return prisma.attestation.findMany({
      orderBy: { createdAt: 'asc' },
      where,
      include: {
        community: { select: { name: true } },
        AttestationVersion: {
          select: { name: true, description: true, image_url: true },
          orderBy: { createdAt: 'desc' },
        },
        ...(where?.communityId
          ? {
              CommunityEntryAttestation: {
                where: { desciCommunityId: where.communityId },
              },
            }
          : { CommunityEntryAttestation: { select: { desciCommunityId: true, id: true } } }),
      },
    });
  }

  async getEntryAttestations(where?: Prisma.CommunityEntryAttestationWhereInput) {
    return prisma.communityEntryAttestation.findMany({
      orderBy: { createdAt: 'asc' },
      where,
      include: {
        attestation: { select: { protected: true, community: { select: { name: true } } } },
        // desciCommunity: { select: { name: true } },
        attestationVersion: {
          select: { id: true, attestationId: true, name: true, image_url: true, description: true },
        },
      },
    });
  }

  async getAllCommunities() {
    return prisma.desciCommunity.findMany({
      select: {
        id: true,
        name: true,
        image_url: true,
        description: true,
        links: true,
        memberString: true,
        hidden: true,
        subtitle: true,
      },
      orderBy: { name: 'asc' },
      where: { hidden: false },
    });
  }

  async getCommunityAdmin(communityId: number) {
    return prisma.communityMember.findFirst({
      where: { communityId, role: CommunityMembershipRole.ADMIN },
      include: { user: true },
    });
  }

  async addCommunityMember(communityId: number, data: Prisma.CommunityMemberCreateManyInput) {
    const existingMember = await this.findMemberByUserId(communityId, data.userId);
    if (existingMember) return existingMember;
    return prisma.communityMember.create({ data: data });
  }

  async findCommunityById(id: number) {
    return prisma.desciCommunity.findUnique({ where: { id } });
  }

  async getCommunities() {
    return prisma.desciCommunity.findMany({ orderBy: { name: 'asc' }, where: { hidden: false } });
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

  async updateCommunityById(id: number, community: Prisma.DesciCommunityUpdateInput) {
    return prisma.desciCommunity.update({
      where: { id },
      data: community,
    });
  }

  /**
   * This query retrieves data from the "NodeAttestation" table along with the counts of related records from the
   * "Annotation", "NodeAttestationReaction", and "NodeAttestationVerification" tables.
   * It uses left outer joins to include all records from the "NodeAttestation" table,
   * even if there are no related records in the other tables. The WHERE clause filters
   * the results based on the "desciCommunityId" column.
   * The EXISTS subquery checks if there is a matching record in the "CommunityEntryAttestation" table based on
   * the "NodeAttestation.attestationId", "NodeAttestation.attestationVersionId", "NodeAttestation.desciCommunityId"
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
      WHERE t1."revoked" = false AND t1."nodeDpid10" IS NOT NULL AND
        EXISTS
      (SELECT *
        from "CommunityEntryAttestation" c1
        where t1."attestationId" = c1."attestationId" and t1."attestationVersionId" = c1."attestationVersionId" and c1."desciCommunityId" = ${communityId} and c1."required" = true)
        GROUP BY
  		t1.id
    `) as CommunityRadarNode[];

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

  /**
   * This methods takes the result of getCommunityRadar and
   * filter out entries(nodes) whose NodeAttestations don't have atleast on verification
   * @param communityId
   * @returns Array<{ NodeAttestation: CommunityRadarNode[]; nodeDpid10: string; nodeuuid: string; }>
   */
  async getCuratedNodes(communityId: number) {
    const nodesOnRadar = await this.getCommunityRadar(communityId);
    logger.info({ nodesOnRadar, communityId }, 'Radar');
    const curated = nodesOnRadar.filter((node) =>
      node.NodeAttestation.every((attestation) => attestation.verifications > 0),
    );
    logger.info({ curated, communityId }, 'CURATED');
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
      WHERE t1."desciCommunityId" = ${communityId} AND t1."revoked" = false
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
   * Query all NodeAttestation and join their engagmement metrics (reactions, annotations, verifications)
   * that fall in the subsets of a community's entry attestations
   * Aggregate all their metrics and return;
   * @param communityId
   * @returns Promise<{ reactions: number; annotations: number; verifications: number; }>}
   */
  async getCommunityRadarEngagementSignal(communityId: number) {
    const claims = (await prisma.$queryRaw`
      SELECT t1.*,
      count(DISTINCT "Annotation".id)::int AS annotations,
      count(DISTINCT "NodeAttestationReaction".id)::int AS reactions,
      count(DISTINCT "NodeAttestationVerification".id)::int AS verifications
      FROM "NodeAttestation" t1
        left outer JOIN "Annotation" ON t1."id" = "Annotation"."nodeAttestationId"
        left outer JOIN "NodeAttestationReaction" ON t1."id" = "NodeAttestationReaction"."nodeAttestationId"
        left outer JOIN "NodeAttestationVerification" ON t1."id" = "NodeAttestationVerification"."nodeAttestationId"
       WHERE
        EXISTS
      (SELECT *
        from "CommunityEntryAttestation" c1
        where t1."attestationId" = c1."attestationId" and t1."attestationVersionId" = c1."attestationVersionId" and c1."desciCommunityId" = ${communityId} and c1."required" = true)
        GROUP BY
  		t1.id
    `) as CommunityRadarNode[];

    const entryAttestations = await attestationService.getCommunityEntryAttestations(communityId);
    const signals = _(claims)
      .groupBy((x) => x.nodeDpid10)
      .map((value: CommunityRadarNode[], key: string) => value)
      .filter((attestations) => attestations.length === entryAttestations.length)
      .flatten()
      .value();

    const groupedEngagements = signals.reduce(
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
   * Query all NodeAttestation that fall in the subsets of a community's entry attestations
   *  by nodeDpid10 and join their engagmement metrics (reactions, annotations, verifications)
   * Aggregate all their metrics and return;
   * @param communityId
   * @returns Promise<{ reactions: number; annotations: number; verifications: number; }>}
   */
  async getNodeVerifiedEngagementsByCommunity(dpid: string, communityId: number) {
    const claims = (await prisma.$queryRaw`
      SELECT
          t1.*,
          count(DISTINCT "Annotation".id) :: int AS annotations,
          count(DISTINCT "NodeAttestationReaction".id) :: int AS reactions,
          count(DISTINCT "NodeAttestationVerification".id) :: int AS verifications
      FROM
          "NodeAttestation" t1
          LEFT OUTER JOIN "Annotation" ON t1."id" = "Annotation"."nodeAttestationId"
          LEFT OUTER JOIN "NodeAttestationReaction" ON t1."id" = "NodeAttestationReaction"."nodeAttestationId"
          LEFT OUTER JOIN "NodeAttestationVerification" ON t1."id" = "NodeAttestationVerification"."nodeAttestationId"
      WHERE
          t1."nodeDpid10" = ${dpid}
          AND EXISTS (
              SELECT
                  *
              FROM
                  "CommunityEntryAttestation" c1
              WHERE
                  t1."attestationId" = c1."attestationId"
                  AND t1."attestationVersionId" = c1."attestationVersionId"
                  AND c1."desciCommunityId" = ${communityId}
          )
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
      WHERE t1."desciCommunityId" = ${communityId} AND t1."nodeDpid10" = ${dpid} AND t1."revoked" = false
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

  async getAllMembers(communityId: number) {
    return await prisma.communityMember.findMany({
      where: { communityId, role: CommunityMembershipRole.MEMBER },
      include: { user: true },
    });
  }

  async findMemberByUserId(communityId: number, userId: number) {
    return await prisma.communityMember.findUnique({ where: { userId_communityId: { userId, communityId } } });
  }

  async findMemberById(id: number) {
    return await prisma.communityMember.findUnique({ where: { id } });
  }

  async removeMember(communityId: number, userId: number) {
    return prisma.communityMember.delete({ where: { userId_communityId: { userId, communityId } } });
  }

  async removeMemberById(id: number) {
    return prisma.communityMember.delete({ where: { id } });
  }
}

export const communityService = new CommunityService();
