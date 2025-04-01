import {
  Attestation,
  CommunityMembershipRole,
  CommunityRadarEntry,
  NodeAttestation,
  NodeFeedItem,
  Prisma,
  Submissionstatus,
} from '@prisma/client';
import _, { includes } from 'lodash';

import { prisma } from '../client.js';
import { ForbiddenError } from '../core/ApiError.js';
import { DuplicateDataError } from '../core/communities/error.js';
import { logger } from '../logger.js';

import { attestationService } from './Attestation.js';

export type CommunityRadarNode = NodeAttestation & { annotations: number; reactions: number; verifications: number };
export type RadarEntry = CommunityRadarEntry & { annotations: number; reactions: number; verifications: number };
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
    return prisma.desciCommunity.findFirst({
      where: { OR: [{ name }, { slug: name }] },
      include: {
        CommunityMember: { select: { id: true, role: true, userId: true, user: { select: { name: true } } } },
      },
    });
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

  async countCommunityRadar(desciCommunityId: number) {
    const entryAttestations = await attestationService.getCommunityEntryAttestations(desciCommunityId);

    const count = (await prisma.$queryRaw`
      SELECT
          count(*)
      FROM
          "CommunityRadarEntry" cre
          LEFT JOIN (
              SELECT
                  Na."id",
                  Na."communityRadarEntryId",
                  Na."attestationId",
                  Na."attestationVersionId"
              FROM
                  "NodeAttestation" Na
                  LEFT JOIN "NodeAttestationVerification" Nav ON Na."id" = Nav."nodeAttestationId"
              WHERE
                  Na."revoked" = false
                  AND Na."nodeDpid10" IS NOT NULL
              GROUP BY
                  Na."id",
                  Na."communityRadarEntryId"
          ) NaFiltered ON cre."id" = NaFiltered."communityRadarEntryId"
      WHERE
          EXISTS (
              SELECT
                  1
              FROM
                  "CommunityEntryAttestation" Cea
              WHERE
                  NaFiltered."attestationId" = Cea."attestationId"
                  AND NaFiltered."attestationVersionId" = Cea."attestationVersionId"
                  AND Cea."desciCommunityId" = ${desciCommunityId}
                  AND Cea."required" = TRUE
          )
      GROUP BY
          cre.id
      HAVING
          COUNT(DISTINCT NaFiltered."id") = ${entryAttestations.length}
    `) as any[];
    return count.length;
  }

  async listCommunityRadar({ communityId, offset, limit }: { communityId: number; offset: number; limit: number }) {
    const entryAttestations = await attestationService.getCommunityEntryAttestations(communityId);
    const entries = await prisma.$queryRaw`
      SELECT
          cre.*,
          count(DISTINCT "Annotation".id) :: int AS annotations,
          count(DISTINCT "NodeAttestationReaction".id) :: int AS reactions,
          count(DISTINCT "NodeAttestationVerification".id) :: int AS verifications,
          COUNT(DISTINCT NaFiltered."id") :: int AS valid_attestations
      FROM
          "CommunityRadarEntry" cre
        LEFT JOIN (
          SELECT
              Na."id",
              Na."communityRadarEntryId",
              Na."attestationId",
              Na."attestationVersionId"
          FROM
              "NodeAttestation" Na
          WHERE
              Na."revoked" = false
              AND Na."nodeDpid10" IS NOT NULL
          GROUP BY
              Na."id",
              Na."communityRadarEntryId"
      ) NaFiltered ON cre."id" = NaFiltered."communityRadarEntryId"
          LEFT OUTER JOIN "Annotation" ON NaFiltered."id" = "Annotation"."nodeAttestationId"
          LEFT OUTER JOIN "NodeAttestationReaction" ON NaFiltered."id" = "NodeAttestationReaction"."nodeAttestationId"
          LEFT OUTER JOIN "NodeAttestationVerification" ON NaFiltered."id" = "NodeAttestationVerification"."nodeAttestationId"
      WHERE
          EXISTS (
              SELECT
                  *
              FROM
                  "CommunityEntryAttestation" Cea
              WHERE
                  NaFiltered."attestationId" = Cea."attestationId"
                  AND NaFiltered."attestationVersionId" = cea."attestationVersionId"
                  AND Cea."desciCommunityId" = ${communityId}
                  AND Cea."required" = TRUE
          )
      GROUP BY
          cre.id
      HAVING
          COUNT(DISTINCT NaFiltered."id") = ${entryAttestations.length}
      ORDER BY
          verifications ASC,
          cre."createdAt" DESC
      LIMIT
          ${limit}
      OFFSET ${offset};
      `;

    return entries as RadarEntry[];
  }

  async countCommunityCuratedFeed(desciCommunityId: number) {
    const entryAttestations = await attestationService.getCommunityEntryAttestations(desciCommunityId);

    const count = (await prisma.$queryRaw`
      SELECT
          count(*)
      FROM
          "CommunityRadarEntry" cre
          LEFT JOIN (
              SELECT
                  Na."id",
                  Na."communityRadarEntryId",
                  Na."attestationId",
                  Na."attestationVersionId"
              FROM
                  "NodeAttestation" Na
                  LEFT JOIN "NodeAttestationVerification" Nav ON Na."id" = Nav."nodeAttestationId"
              WHERE
                  Na."revoked" = false
                  AND Na."nodeDpid10" IS NOT NULL
              GROUP BY
                  Na."id",
                  Na."communityRadarEntryId"
              HAVING
                  COUNT(Nav."id") > 0
          ) NaFiltered ON cre."id" = NaFiltered."communityRadarEntryId"
      WHERE
          EXISTS (
              SELECT
                  1
              FROM
                  "CommunityEntryAttestation" Cea
              WHERE
                  NaFiltered."attestationId" = Cea."attestationId"
                  AND NaFiltered."attestationVersionId" = Cea."attestationVersionId"
                  AND Cea."desciCommunityId" = ${desciCommunityId}
                  AND Cea."required" = TRUE
          )
      GROUP BY
          cre.id
      HAVING
          COUNT(DISTINCT NaFiltered."id") = ${entryAttestations.length}
    `) as any[];
    return count.length;
  }

  async listCommunityCuratedFeed({
    communityId,
    offset,
    limit,
  }: {
    communityId: number;
    offset: number;
    limit: number;
  }) {
    const entryAttestations = await attestationService.getCommunityEntryAttestations(communityId);

    const entries = await prisma.$queryRaw`
      SELECT
          cre.*,
          COUNT(DISTINCT "Annotation".id) :: int AS annotations,
          COUNT(DISTINCT "NodeAttestationReaction".id) :: int AS reactions,
          COUNT(DISTINCT "NodeAttestationVerification".id) :: int AS verifications,
          COUNT(DISTINCT NaFiltered."id") :: int AS valid_attestations
      FROM
          "CommunityRadarEntry" cre
      LEFT JOIN (
          SELECT
              Na."id",
              Na."communityRadarEntryId",
              Na."attestationId",
              Na."attestationVersionId"
          FROM
              "NodeAttestation" Na
          LEFT JOIN "NodeAttestationVerification" Nav ON Na."id" = Nav."nodeAttestationId"
          WHERE
              Na."revoked" = false
              AND Na."nodeDpid10" IS NOT NULL
          GROUP BY
              Na."id",
              Na."communityRadarEntryId"
          HAVING
              COUNT(Nav."id") > 0
      ) NaFiltered ON cre."id" = NaFiltered."communityRadarEntryId"
      LEFT JOIN "Annotation" ON NaFiltered."id" = "Annotation"."nodeAttestationId"
      LEFT JOIN "NodeAttestationReaction" ON NaFiltered."id" = "NodeAttestationReaction"."nodeAttestationId"
      LEFT JOIN "NodeAttestationVerification" ON NaFiltered."id" = "NodeAttestationVerification"."nodeAttestationId"
      WHERE
          EXISTS (
              SELECT
                  1
              FROM
                  "CommunityEntryAttestation" Cea
              WHERE
                  NaFiltered."attestationId" = Cea."attestationId"
                  AND NaFiltered."attestationVersionId" = Cea."attestationVersionId"
                  AND Cea."desciCommunityId" = ${communityId}
                  AND Cea."required" = TRUE
          )
      GROUP BY
          cre.id
      HAVING
          COUNT(DISTINCT NaFiltered."id") = ${entryAttestations.length}
      ORDER BY
          verifications DESC
      OFFSET ${offset}
      LIMIT
          ${limit};
      `;

    return entries as RadarEntry[];
  }

  async listAllCommunityCuratedFeeds({ offset, limit }: { offset: number; limit: number }) {
    const entries = (await prisma.$queryRaw`
      SELECT
          cre.*,
          COUNT(DISTINCT "Annotation".id) :: int AS annotations,
          COUNT(DISTINCT "NodeAttestationReaction".id) :: int AS reactions,
          COUNT(DISTINCT "NodeAttestationVerification".id) :: int AS verifications,
          COUNT(DISTINCT NaFiltered."id") :: int AS valid_attestations,
          COUNT(DISTINCT NaEntry."id") :: int AS entry_attestations
      FROM
          "CommunityRadarEntry" cre
          LEFT JOIN (
              SELECT
                  Na."id",
                  Na."communityRadarEntryId",
                  Na."attestationId",
                  Na."attestationVersionId",
                  Na."desciCommunityId"
              FROM
                  "NodeAttestation" Na
                  LEFT JOIN "NodeAttestationVerification" Nav ON Na."id" = Nav."nodeAttestationId"
              WHERE
                  Na."revoked" = false
                  AND Na."nodeDpid10" IS NOT NULL
                  AND EXISTS (
                      SELECT
                          1
                      FROM
                          "CommunityEntryAttestation" Cea
                      WHERE
                          Na."attestationId" = Cea."attestationId"
                          AND Na."attestationVersionId" = Cea."attestationVersionId"
                          AND Na."desciCommunityId" = Cea."desciCommunityId"
                          AND Cea."required" = TRUE
                  )
              GROUP BY
                  Na."id",
                  Na."communityRadarEntryId"
              HAVING
                  COUNT(Nav."id") > 0
          ) NaFiltered ON cre."id" = NaFiltered."communityRadarEntryId"
          LEFT JOIN "Annotation" ON NaFiltered."id" = "Annotation"."nodeAttestationId"
          LEFT JOIN "NodeAttestationReaction" ON NaFiltered."id" = "NodeAttestationReaction"."nodeAttestationId"
          LEFT JOIN "NodeAttestationVerification" ON NaFiltered."id" = "NodeAttestationVerification"."nodeAttestationId"
          LEFT JOIN (
              SELECT
                  Na."id",
                  Na."communityRadarEntryId",
                  Na."attestationId",
                  Na."attestationVersionId",
                  Na."desciCommunityId"
              FROM
                  "NodeAttestation" Na
              WHERE
                  Na."revoked" = false
                  AND Na."nodeDpid10" IS NOT NULL
                  AND EXISTS (
                      SELECT
                          1
                      FROM
                          "CommunityEntryAttestation" Cea
                      WHERE
                          Na."attestationId" = Cea."attestationId"
                          AND Na."attestationVersionId" = Cea."attestationVersionId"
                          AND Na."desciCommunityId" = Cea."desciCommunityId"
                          AND Cea."required" = TRUE
                  )
              GROUP BY
                  Na."id",
                  Na."communityRadarEntryId"
          ) NaEntry ON cre."id" = NaEntry."communityRadarEntryId"
      WHERE
          EXISTS (
              SELECT
                  1
              FROM
                  "CommunityEntryAttestation" Cea
              WHERE
                  NaFiltered."attestationId" = Cea."attestationId"
                  AND NaFiltered."attestationVersionId" = Cea."attestationVersionId"
                  AND Cea."required" = TRUE
          )
      GROUP BY
          cre.id,
          cre."nodeUuid"
      HAVING
          COUNT(DISTINCT NaFiltered."id") = COUNT(DISTINCT NaEntry."id")
      ORDER BY
          verifications DESC,
          cre."createdAt" DESC
      LIMIT ${limit} 
      OFFSET ${offset}
      `) as RadarEntry[];

    return entries as RadarEntry[];
  }

  async countAllCommunityCuratedFeeds() {
    const count = (await prisma.$queryRaw`
      SELECT
        count(*),
        cre."nodeUuid",
        COUNT(DISTINCT NaFiltered."id") :: int AS valid_attestations,
        COUNT(DISTINCT NaEntry."id") :: int AS entry_attestations
      FROM
        "CommunityRadarEntry" cre
        LEFT JOIN (
            SELECT
                Na."id",
                Na."communityRadarEntryId",
                Na."attestationId",
                Na."attestationVersionId",
                Na."desciCommunityId"
            FROM
                "NodeAttestation" Na
                LEFT JOIN "NodeAttestationVerification" Nav ON Na."id" = Nav."nodeAttestationId"
            WHERE
                Na."revoked" = false
                AND Na."nodeDpid10" IS NOT NULL
                AND EXISTS (
                    SELECT
                        1
                    FROM
                        "CommunityEntryAttestation" Cea
                    WHERE
                        Na."attestationId" = Cea."attestationId"
                        AND Na."attestationVersionId" = Cea."attestationVersionId"
                        AND Na."desciCommunityId" = Cea."desciCommunityId"
                        AND Cea."required" = TRUE
                )
            GROUP BY
                Na."id",
                Na."communityRadarEntryId"
            HAVING
                COUNT(Nav."id") > 0
        ) NaFiltered ON cre."id" = NaFiltered."communityRadarEntryId"
        LEFT JOIN (
            SELECT
                Na."id",
                Na."communityRadarEntryId",
                Na."attestationId",
                Na."attestationVersionId"
            FROM
                "NodeAttestation" Na 
            WHERE
                Na."revoked" = false
                AND Na."nodeDpid10" IS NOT NULL
                AND EXISTS (
                    SELECT
                        1
                    FROM
                        "CommunityEntryAttestation" Cea
                    WHERE
                        Na."attestationId" = Cea."attestationId"
                        AND Na."attestationVersionId" = Cea."attestationVersionId"
                        AND Cea."required" = TRUE
                )
            GROUP BY
                Na."id",
                Na."communityRadarEntryId"
        ) NaEntry ON cre."id" = NaEntry."communityRadarEntryId"
      WHERE
        EXISTS (
            SELECT
                1
            FROM
                "CommunityEntryAttestation" Cea
            WHERE
                NaFiltered."attestationId" = Cea."attestationId"
                AND NaFiltered."attestationVersionId" = Cea."attestationVersionId"
                AND Cea."required" = TRUE
        )
      GROUP BY
        cre.id,
        cre."nodeUuid"
      HAVING
        COUNT(DISTINCT NaFiltered."id") = COUNT(DISTINCT NaEntry."id")
`) as any[];
    return count.length;
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

  async addToRadar(desciCommunityId: number, nodeUuid: string) {
    // check if node has claimed all community entry attestations
    const entryAttestations = await communityService.getEntryAttestations({
      desciCommunityId,
      required: true,
    });

    const claimedAttestations = await prisma.nodeAttestation.findMany({
      where: { desciCommunityId, nodeUuid, revoked: false },
    });

    const isEntriesClaimed = entryAttestations.every((entry) =>
      claimedAttestations.find(
        (claimed) =>
          claimed.attestationId === entry.attestationId && claimed.attestationVersionId === entry.attestationVersionId,
      ),
    );

    if (!isEntriesClaimed) return undefined;

    const radarEntry = await prisma.communityRadarEntry.upsert({
      where: {
        nodeUuid_desciCommunityId: { desciCommunityId, nodeUuid },
      },
      create: {
        nodeUuid,
        desciCommunityId,
      },
      update: {
        desciCommunityId,
        nodeUuid,
      },
    });

    await prisma.$transaction(
      claimedAttestations.map((claim) =>
        prisma.nodeAttestation.update({ where: { id: claim.id }, data: { communityRadarEntryId: radarEntry.id } }),
      ),
    );

    return radarEntry;
  }

  async removeFromRadar(desciCommunityId: number, nodeUuid: string) {
    // check if node has claimed all community entry attestations
    const entryAttestations = await communityService.getEntryAttestations({
      desciCommunityId,
      required: true,
    });

    const claimedAttestations = await prisma.nodeAttestation.findMany({
      where: { desciCommunityId, nodeUuid, revoked: false },
    });

    const isEntriesClaimed = entryAttestations.every((entry) =>
      claimedAttestations.find(
        (claimed) =>
          claimed.attestationId === entry.attestationId && claimed.attestationVersionId === entry.attestationVersionId,
      ),
    );

    if (isEntriesClaimed) return undefined;
    const entry = await prisma.communityRadarEntry.findFirst({
      where: {
        desciCommunityId,
        nodeUuid,
      },
    });

    logger.trace({ entry }, 'removeFromRadar');

    if (!entry) return null;

    await prisma.$transaction(
      claimedAttestations.map((claim) =>
        prisma.nodeAttestation.update({ where: { id: claim.id }, data: { communityRadarEntryId: null } }),
      ),
    );

    return await prisma.communityRadarEntry.delete({
      where: {
        id: entry.id,
      },
    });
  }

  async createSubmission({ communityId, nodeId, userId }: { nodeId: string; communityId: number; userId: number }) {
    const nodeVersion = await prisma.nodeVersion.count({
      where: { node: { uuid: nodeId }, OR: [{ transactionId: { not: null } }, { commitId: { not: null } }] },
    });

    const exisiting = await this.getUserSubmissionById({ communityId, userId, nodeId });

    if (exisiting && exisiting.nodeVersion === nodeVersion) {
      throw new ForbiddenError('This version of your submission already exists, publish a new version to resubmit');
    }

    if (exisiting && exisiting.status === Submissionstatus.REJECTED) {
      return await prisma.communitySubmission.update({
        where: { id: exisiting.id },
        data: {
          status: Submissionstatus.PENDING,
          nodeVersion,
          rejectedAt: null,
          rejectionReason: null,
        },
        select: {
          id: true,
          status: true,
          userId: true,
          nodeId: true,
          communityId: true,
          nodeVersion: true,
          node: { select: { id: true, uuid: true, title: true, ownerId: true, dpidAlias: true } },
          community: { select: { id: true, name: true, image_url: true } },
        },
      });
    } else if (exisiting && exisiting.status !== Submissionstatus.REJECTED) {
      throw new DuplicateDataError('Submission already exits');
    }

    if (nodeVersion === 0) throw new ForbiddenError('Only published nodes can be submitted.');
    return await prisma.communitySubmission.create({
      data: {
        nodeId,
        userId,
        communityId,
        nodeVersion,
        status: Submissionstatus.PENDING,
      },
      select: {
        id: true,
        status: true,
        userId: true,
        nodeId: true,
        communityId: true,
        nodeVersion: true,
        node: { select: { id: true, uuid: true, title: true, ownerId: true, dpidAlias: true } },
        community: { select: { id: true, name: true, image_url: true } },
      },
    });
  }
  async getCommunitySubmissions({ communityId, status }: { communityId: number; status?: Submissionstatus }) {
    return await prisma.communitySubmission.findMany({
      where: {
        communityId: Number(communityId),
        ...(status && { status: status as Submissionstatus }),
      },
      include: {
        node: { select: { id: true, uuid: true, title: true, ownerId: true, dpidAlias: true } },
        // community: { select: { id: true, name: true, image_url: true, description: true } },
      },
    });
  }
  async getUserSubmissions(userId: number, status?: Submissionstatus) {
    return await prisma.communitySubmission.findMany({
      where: {
        node: {
          ownerId: userId,
        },
        ...(status && { status: status as Submissionstatus }),
      },
      include: {
        node: { select: { id: true, uuid: true, title: true, ownerId: true, dpidAlias: true } },
        community: { select: { id: true, name: true, image_url: true, description: true } },
      },
    });
  }
  async getUserSubmissionById({
    userId,
    nodeId,
    communityId,
  }: {
    userId: number;
    communityId: number;
    nodeId: string;
  }) {
    return await prisma.communitySubmission.findFirst({
      where: {
        node: {
          ownerId: userId,
          uuid: nodeId,
        },
        communityId,
        // ...(status && { status: status as Submissionstatus }),
      },
      include: {
        node: { select: { id: true, uuid: true, title: true, ownerId: true, dpidAlias: true } },
        community: { select: { id: true, name: true, image_url: true, description: true } },
      },
    });
  }

  async getPendingUserSubmissionById(userId: number, submissionId: number) {
    return await prisma.communitySubmission.findFirst({
      where: { id: submissionId, userId, status: Submissionstatus.PENDING },
      select: { id: true },
    });
  }

  async updateSubmissionStatus(id: number, status: Submissionstatus, rejectionReason?: string) {
    return await prisma.communitySubmission.update({
      where: { id },
      data: {
        status: status as Submissionstatus,
        ...(status === 'ACCEPTED' ? { acceptedAt: new Date() } : {}),
        ...(status === 'REJECTED' ? { rejectedAt: new Date(), rejectionReason } : {}),
      },
      include: {
        node: { select: { id: true, uuid: true, title: true, ownerId: true, dpidAlias: true } },
        community: { select: { id: true, name: true, image_url: true } },
      },
    });
  }
  async getSubmission(submissionId: number) {
    return prisma.communitySubmission.findUnique({
      where: { id: submissionId },
      include: {
        node: { select: { id: true, uuid: true, title: true, ownerId: true, dpidAlias: true } },
        community: { select: { id: true, name: true, image_url: true, description: true } },
      },
    });
  }

  async deleteSubmission(id: number) {
    return prisma.communitySubmission.delete({ where: { id } });
  }
}

export const communityService = new CommunityService();
