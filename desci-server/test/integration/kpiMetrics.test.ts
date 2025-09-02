import { AvailableUserActionLogTypes } from '@desci-labs/desci-models';
import {
  ActionType,
  CommunitySubmission,
  DesciCommunity,
  InteractionLog,
  Node,
  Submissionstatus,
} from '@prisma/client';
// import { Sql } from '@prisma/client/runtime/library.js';
import { subDays } from 'date-fns';
// import { sql } from 'googleapis/build/src/apis/sql/index.js';
import supertest from 'supertest';
import { describe, it, beforeAll, expect, beforeEach, afterEach, assert } from 'vitest';

import { prisma } from '../../src/client.js';
import { generateAccessToken } from '../../src/controllers/auth/magic.js';
import { safePct } from '../../src/services/admin/helper.js';
import { communityService } from '../../src/services/Communities.js';
import { countAllUsers } from '../../src/services/user.js';
import { app } from '../testApp.js';
import {
  createMockGuestUsers,
  createMockNodes,
  createMockUsers,
  logMockUserActions,
  MockUser,
  publishMockNodes,
} from '../util.js';

const clearDatabase = async () => {
  await prisma.$queryRaw`TRUNCATE TABLE "User" CASCADE;`;
  await prisma.$queryRaw`TRUNCATE TABLE "CommunitySubmission" CASCADE;`;
  await prisma.$queryRaw`TRUNCATE TABLE "DesciCommunity" CASCADE;`;
  await prisma.$queryRaw`TRUNCATE TABLE "Node" CASCADE;`;
  await prisma.$queryRaw`TRUNCATE TABLE "NodeVersion" CASCADE;`;
  await prisma.$queryRaw`TRUNCATE TABLE "InteractionLog" CASCADE;`;
};

describe('KPI Metrics', async () => {
  let admin: MockUser;
  let request: supertest.SuperTest<supertest.Test>;

  // mock users
  let mockUsersToday: MockUser[];
  let mockUsersInLast7Days: MockUser[];
  let mockUsersInLast30Days: MockUser[];

  // mock nodes
  let mockNodesToday: Node[];
  let mockNodesInLast7Days: Node[];
  let mockNodesInLast30Days: Node[];

  // mock community
  let desciCommunity: DesciCommunity;

  beforeEach(async () => {
    const adminUser = await prisma.user.create({
      data: {
        email: 'test@desci.com',
        isAdmin: true,
        createdAt: new Date('2020-04-01'),
      },
    });

    admin = {
      user: adminUser,
      token: generateAccessToken({ email: adminUser.email }),
    };

    // create 10 mock users today
    mockUsersToday = await createMockUsers(10, new Date());
    // create 10 mock users in the past 7 days
    mockUsersInLast7Days = await createMockUsers(10, subDays(new Date(), 5));
    // create 10 mock users in the past 30 days
    mockUsersInLast30Days = await createMockUsers(10, subDays(new Date(), 28));

    // create 10 mock nodes
    mockNodesToday = await createMockNodes(mockUsersToday, new Date());
    // create 10 mock nodes in the past 7 days
    mockNodesInLast7Days = await createMockNodes(mockUsersInLast7Days, subDays(new Date(), 5));
    // create 10 mock nodes in the past 30 days
    mockNodesInLast30Days = await createMockNodes(mockUsersInLast30Days, subDays(new Date(), 28));

    // create a desci community
    desciCommunity = await prisma.desciCommunity.create({
      data: {
        name: 'Desci Community',
        description: 'Desci Community',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });

    request = supertest(app);
  });

  afterEach(async () => {
    await clearDatabase();
  });

  describe('User Engagements', () => {
    let communitySubmission: Partial<CommunitySubmission>;

    interface UserEngagementMetricsData {
      activeUsers: {
        daily: number;
        weekly: number;
        monthly: number;
      };
      publishingUsers: {
        daily: number;
        weekly: number;
        monthly: number;
      };
      exploringUsers: {
        daily: number;
        weekly: number;
        monthly: number;
      };
    }

    beforeEach(async () => {
      // log 5 user interactions today
      await logMockUserActions(mockUsersToday.slice(0, 5), AvailableUserActionLogTypes.viewedNode, new Date());
      // log 10 user interactions today
      await logMockUserActions(
        mockUsersInLast7Days.slice(0, 10),
        AvailableUserActionLogTypes.viewedNode,
        subDays(new Date(), 5),
      );
      // log 10 user interactions today
      await logMockUserActions(
        mockUsersInLast30Days.slice(0, 10),
        AvailableUserActionLogTypes.viewedNode,
        subDays(new Date(), 28),
      );

      // publish 5 nodes today
      await publishMockNodes(mockNodesToday.slice(0, 5), new Date());
      // publish 5 nodes in the past 7 days
      await publishMockNodes(mockNodesInLast7Days.slice(0, 5), subDays(new Date(), 5));
      // publish 7 nodes in the past 30 days
      await publishMockNodes(mockNodesInLast30Days.slice(0, 7), subDays(new Date(), 28));

      // log 5 "actionResearchObjectUpdated" interactions
      await logMockUserActions(
        mockUsersToday.slice(0, 5),
        AvailableUserActionLogTypes.actionResearchObjectUpdated,
        new Date(),
      );
      // log 10 "actionResearchObjectShared" interactions
      await logMockUserActions(
        mockUsersInLast7Days.slice(0, 10),
        AvailableUserActionLogTypes.actionResearchObjectShared,
        subDays(new Date(), 5),
      );

      // create a community submission
      assert(mockNodesToday[0].uuid, 'Node UUID is required');

      communitySubmission = await communityService.createSubmission({
        nodeId: mockNodesToday[0].uuid,
        communityId: desciCommunity.id,
        userId: mockUsersToday[0].user.id,
      });

      // log 5 exploring user interactions today
      await logMockUserActions(mockUsersToday.slice(0, 5), AvailableUserActionLogTypes.search, new Date());
      // log 5 exploring user interactions in last 7 days
      await logMockUserActions(
        mockUsersInLast7Days.slice(0, 5),
        AvailableUserActionLogTypes.search,
        subDays(new Date(), 5),
      );
      // log 1 exploring user interaction in last 30 days
      await logMockUserActions(
        mockUsersInLast30Days.slice(0, 1),
        AvailableUserActionLogTypes.search,
        subDays(new Date(), 28),
      );
    });

    it('should return the correct user engagement metrics', async () => {
      const response = await request
        .get('/v1/admin/metrics/user-engagements')
        .set('Authorization', `Bearer ${admin.token}`);
      const data = response.body.data as UserEngagementMetricsData;

      // assert response status
      expect(response.status).toBe(200);

      // assert active users KPIs
      expect(data.activeUsers.daily).toBe(5);
      expect(data.activeUsers.weekly).toBe(15);
      expect(data.activeUsers.monthly).toBe(25);

      // assert publishing users KPIs
      expect(data.publishingUsers.daily).toBe(5);
      expect(data.publishingUsers.weekly).toBe(15);
      expect(data.publishingUsers.monthly).toBe(15);

      // assert exploring users KPIs
      expect(data.exploringUsers.daily).toBe(5);
      expect(data.exploringUsers.weekly).toBe(15);
      expect(data.exploringUsers.monthly).toBe(25);
    });
  });

  describe('Publish Metrics', () => {
    interface PublishMetricsData {
      totalUsers: number;
      publishers: number;
      publishersInCommunity: number;
      guestSignUpSuccessRate: number;
      previousPeriod?: {
        totalUsers: number;
        publishers: number;
        publishersInCommunity: number;
        guestSignUpSuccessRate: number;
      };
    }

    let guestUsersToday: MockUser[];
    let guestUsersInLast7Days: MockUser[];
    let guestUsersInLast30Days: MockUser[];

    beforeEach(async () => {
      // publish 50% nodes today
      await publishMockNodes(mockNodesToday.slice(0, 5), new Date());
      // publish 50% nodes in the past 7 days
      await publishMockNodes(mockNodesInLast7Days.slice(0, 5), subDays(new Date(), 5));
      // publish 70% nodes in the past 30 days
      await publishMockNodes(mockNodesInLast30Days.slice(0, 7), subDays(new Date(), 28));

      // create a 5 community submission for nodes today
      await Promise.all(
        mockNodesToday.slice(0, 5).map((node) =>
          prisma.communitySubmission.create({
            data: {
              nodeId: node.uuid!,
              userId: node.ownerId,
              communityId: desciCommunity.id,
              nodeVersion: 1,
              status: Submissionstatus.ACCEPTED,
              createdAt: new Date(),
            },
          }),
        ),
      );

      // create a 5 community submission for nodes in last 7 days
      await Promise.all(
        mockNodesInLast7Days.slice(0, 5).map((node) =>
          prisma.communitySubmission.create({
            data: {
              nodeId: node.uuid!,
              userId: node.ownerId,
              communityId: desciCommunity.id,
              nodeVersion: 1,
              status: Submissionstatus.ACCEPTED,
              createdAt: subDays(new Date(), 5),
            },
          }),
        ),
      );

      // create 10 guest users today
      guestUsersToday = await createMockGuestUsers(10, new Date());
      // create 10 guest users in last 7 days
      guestUsersInLast7Days = await createMockGuestUsers(10, subDays(new Date(), 5));
      // create 10 guest users in last 30 days
      guestUsersInLast30Days = await createMockGuestUsers(10, subDays(new Date(), 28));

      // convert 50% of guest users today to signedUpUsers
      await Promise.all(
        guestUsersToday.slice(0, 5).map((user) =>
          prisma.user.update({
            where: { id: user.user.id },
            data: {
              isGuest: false,
              convertedGuest: true,
            },
          }),
        ),
      );
      // convert 50% of guest users in last 7 days to signedUpUsers
      await Promise.all(
        guestUsersInLast7Days.slice(0, 5).map((user) =>
          prisma.user.update({
            where: { id: user.user.id },
            data: {
              isGuest: false,
              convertedGuest: true,
            },
          }),
        ),
      );
      // convert 50% of guest users in last 30 days to signedUpUsers
      await Promise.all(
        guestUsersInLast30Days.slice(0, 5).map((user) =>
          prisma.user.update({
            where: { id: user.user.id },
            data: { isGuest: false, convertedGuest: true },
          }),
        ),
      );
    });

    it('should return the correct publish funnel metrics', async () => {
      const response = await request
        .get('/v1/admin/metrics/publish-metrics')
        .set('Authorization', `Bearer ${admin.token}`);
      const data = response.body.data as PublishMetricsData;

      // assert response status
      expect(response.status).toBe(200);

      // assert publishing users KPIs
      expect(data.totalUsers).toBe(
        mockUsersToday.length +
          mockUsersInLast7Days.length +
          mockUsersInLast30Days.length +
          guestUsersToday.length +
          guestUsersInLast7Days.length +
          guestUsersInLast30Days.length +
          1, // admin user
      );
      expect(data.publishers).toBe(28);
      expect(data.publishersInCommunity).toBe(16);
      expect(data.guestSignUpSuccessRate).toBe(50);
    });

    it('should return the correct publish funnel metrics for the past 3 days with compareToPreviousPeriod enabled', async () => {
      const selectedDates = {
        from: subDays(new Date(), 3).toISOString(),
        to: new Date().toISOString(),
      };

      const response = await request
        .get('/v1/admin/metrics/publish-metrics')
        .query({
          from: selectedDates.from,
          to: selectedDates.to,
          compareToPreviousPeriod: true,
        })
        .set('Authorization', `Bearer ${admin.token}`);
      const data = response.body.data as PublishMetricsData;

      // assert response status
      expect(response.status).toBe(200);

      // assert publishing users KPIs
      expect(data.totalUsers).toBe(mockUsersToday.length + guestUsersToday.length);
      expect(data.publishers).toBe(25);
      expect(data.publishersInCommunity).toBe(25);
      expect(data.guestSignUpSuccessRate).toBe(50);

      // assert previous period KPIs
      expect(data.previousPeriod?.totalUsers).toBe(mockUsersInLast7Days.length + guestUsersInLast7Days.length);
      expect(data.previousPeriod?.publishers).toBe(25);
      expect(data.previousPeriod?.publishersInCommunity).toBe(25);
      expect(data.previousPeriod?.guestSignUpSuccessRate).toBe(50);
    });
  });

  describe('Research Object Metrics', () => {
    interface ResearchObjectMetrics {
      totalRoCreated: number;
      averageRoCreatedPerUser: number;
      medianRoCreatedPerUser: number;
      previousPeriod?: {
        totalRoCreated: number;
        averageRoCreatedPerUser: number;
        medianRoCreatedPerUser: number;
      };
    }

    beforeEach(async () => {
      // create 10 mock nodes
      await createMockNodes(mockUsersToday.slice(0, 5), new Date());
      // create 10 mock nodes in the past 7 days
      await createMockNodes(mockUsersInLast7Days.slice(0, 8), subDays(new Date(), 5));
      // create 10 mock nodes in the past 30 days
      await createMockNodes(mockUsersInLast30Days.slice(0, 2), subDays(new Date(), 28));
    });

    it('should return the correct all time research object metrics', async () => {
      const response = await request
        .get('/v1/admin/metrics/research-object-metrics')
        .set('Authorization', `Bearer ${admin.token}`);
      const data = response.body.data as ResearchObjectMetrics;

      // assert response status
      expect(response.status).toBe(200);
      expect(data.totalRoCreated).toBe(45);
      expect(data.averageRoCreatedPerUser).toBe(1.5);
      expect(data.medianRoCreatedPerUser).toBe(1.5);
    });

    it('should return the correct research object metrics for the past 3 days with compareToPreviousPeriod enabled', async () => {
      const selectedDates = {
        from: subDays(new Date(), 3).toISOString(),
        to: new Date().toISOString(),
      };

      const response = await request
        .get('/v1/admin/metrics/research-object-metrics')
        .query({
          from: selectedDates.from,
          to: selectedDates.to,
          compareToPreviousPeriod: true,
        })
        .set('Authorization', `Bearer ${admin.token}`);
      const data = response.body.data as ResearchObjectMetrics;

      // assert response status
      expect(response.status).toBe(200);

      // assert publishing users KPIs
      expect(data.totalRoCreated).toBe(15);
      expect(data.averageRoCreatedPerUser).toBe(1.5);
      expect(data.medianRoCreatedPerUser).toBe(1.5);

      // assert previous period KPIs
      expect(data.previousPeriod?.totalRoCreated).toBe(18);
      expect(data.previousPeriod?.averageRoCreatedPerUser).toBe(1.8);
      expect(data.previousPeriod?.medianRoCreatedPerUser).toBe(2);
    });
  });

  describe('Retention Metrics', () => {
    let mockUsersInLastYear: MockUser[];
    let day1InteractionLogs: InteractionLog[];
    let day7InteractionLogs: InteractionLog[];
    let day30InteractionLogs: InteractionLog[];
    let day365InteractionLogs: InteractionLog[];

    interface RetentionMetrics {
      day1Retention: number;
      day7Retention: number;
      day30Retention: number;
      day365Retention: number;
    }

    beforeEach(async () => {
      // log 5 user interactions today
      day1InteractionLogs = await logMockUserActions(
        mockUsersToday.slice(0, 5),
        AvailableUserActionLogTypes.viewedNode,
        new Date(),
      );
      // log 10 user interactions today
      day7InteractionLogs = await logMockUserActions(
        mockUsersInLast7Days.slice(0, 8),
        AvailableUserActionLogTypes.viewedNode,
        new Date(),
      );
      // log 10 user interactions today
      day30InteractionLogs = await logMockUserActions(
        mockUsersInLast30Days.slice(0, 5),
        AvailableUserActionLogTypes.viewedNode,
        new Date(),
      );

      mockUsersInLastYear = await createMockUsers(10, subDays(new Date(), 363));
      day365InteractionLogs = await logMockUserActions(
        mockUsersInLastYear.slice(0, 5),
        AvailableUserActionLogTypes.viewedNode,
        new Date(),
      );
    });

    it('should return the correct all time retention metrics', async () => {
      const response = await request
        .get('/v1/admin/metrics/retention-metrics')
        .set('Authorization', `Bearer ${admin.token}`);
      const data = response.body.data as RetentionMetrics;

      const total = await countAllUsers();
      // assert response status
      expect(response.status).toBe(200);
      expect(data.day1Retention).toBe(safePct(day1InteractionLogs.length, total));
      expect(data.day7Retention).toBe(safePct(day7InteractionLogs.length + day1InteractionLogs.length, total));
      expect(data.day30Retention).toBe(
        safePct(day1InteractionLogs.length + day7InteractionLogs.length + day30InteractionLogs.length, total),
      );
      expect(data.day365Retention).toBe(
        safePct(
          day1InteractionLogs.length +
            day7InteractionLogs.length +
            day30InteractionLogs.length +
            day365InteractionLogs.length,
          total,
        ),
      );
    });
  });

  describe('Feature Adoption Metrics', () => {
    interface FeatureAdoptionMetricsData {
      totalShares: number;
      totalCoAuthorInvites: number;
      totalAIAnalyticsClicks: number;
      totalMatchedArticleClicks: number;
      totalClaimedBadges: number;
      totalProfileViews: number;
      totalGuestModeVisits: number;
      previousPeriod?: {
        totalShares: number;
        totalCoAuthorInvites: number;
        totalAIAnalyticsClicks: number;
        totalMatchedArticleClicks: number;
        totalClaimedBadges: number;
        totalProfileViews: number;
        totalGuestModeVisits: number;
      };
    }

    let guestUsersToday: MockUser[];
    let guestUsersInLast7Days: MockUser[];
    let guestUsersInLast30Days: MockUser[];

    let day1ShareLogs: InteractionLog[];
    let day1CoAuthorInviteLogs: InteractionLog[];
    let day1AIAnalyticsClicksLogs: InteractionLog[];
    let day1MatchedArticleClicksLogs: InteractionLog[];
    let day1ClaimedBadgesLogs: number;
    let day1ProfileViewsLogs: InteractionLog[];

    let day7ShareLogs: InteractionLog[];
    let day7CoAuthorInviteLogs: InteractionLog[];
    let day7AIAnalyticsClicksLogs: InteractionLog[];
    let day7MatchedArticleClicksLogs: InteractionLog[];
    let day7ClaimedBadgesLogs: number;
    let day7ProfileViewsLogs: InteractionLog[];

    beforeEach(async () => {
      // create 10 guest users today
      guestUsersToday = await createMockGuestUsers(10, new Date());
      // create 5 guest users in last 7 days
      guestUsersInLast7Days = await createMockGuestUsers(5, subDays(new Date(), 5));

      // log 5 actionResearchObjectShared interactions today
      day1ShareLogs = await logMockUserActions(
        mockUsersToday.slice(0, 5),
        AvailableUserActionLogTypes.actionResearchObjectShared,
        new Date(),
      );
      // log 5 actionResearchObjectShared interactions today
      day1CoAuthorInviteLogs = await logMockUserActions(
        mockUsersToday.slice(0, 2),
        AvailableUserActionLogTypes.actionCoAuthorInvited,
        new Date(),
      );
      // log 5 actionResearchObjectShared interactions today
      day1AIAnalyticsClicksLogs = await logMockUserActions(
        mockUsersToday.slice(0, 5),
        AvailableUserActionLogTypes.actionAiAnalyticsTabClicked,
        new Date(),
      );
      // log 5 actionResearchObjectShared interactions today
      day1MatchedArticleClicksLogs = await logMockUserActions(
        mockUsersToday.slice(0, 3),
        AvailableUserActionLogTypes.actionRelatedArticleClickedInAi,
        new Date(),
      );
      // log 5 actionResearchObjectShared interactions today
      let claimedBadges = await prisma.interactionLog.createMany({
        data: mockUsersToday.slice(0, 5).map((user) => ({
          userId: user.user.id,
          action: ActionType.CLAIM_ATTESTATION,
          createdAt: new Date(),
        })),
      });
      day1ClaimedBadgesLogs = claimedBadges.count;
      // log 5 actionResearchObjectShared interactions today
      day1ProfileViewsLogs = await logMockUserActions(
        mockUsersToday.slice(0, 10),
        AvailableUserActionLogTypes.actionAuthorProfileViewed,
        new Date(),
      );

      /// 7 days feature adoption activities

      // log 5 actionResearchObjectShared interactions in the past 4 days
      day7ShareLogs = await logMockUserActions(
        mockUsersInLast7Days.slice(0, 2),
        AvailableUserActionLogTypes.actionResearchObjectShared,
        subDays(new Date(), 4),
      );
      // log 5 actionResearchObjectShared interactions in the past 4 days
      day7CoAuthorInviteLogs = await logMockUserActions(
        mockUsersInLast7Days.slice(0, 1),
        AvailableUserActionLogTypes.actionCoAuthorInvited,
        subDays(new Date(), 4),
      );
      // log 5 actionResearchObjectShared interactions in the past 4 days
      day7AIAnalyticsClicksLogs = await logMockUserActions(
        mockUsersInLast7Days.slice(0, 8),
        AvailableUserActionLogTypes.actionAiAnalyticsTabClicked,
        subDays(new Date(), 4),
      );
      // log 5 actionResearchObjectShared interactions in the past 4 days
      day7MatchedArticleClicksLogs = await logMockUserActions(
        mockUsersInLast7Days.slice(0, 6),
        AvailableUserActionLogTypes.actionRelatedArticleClickedInAi,
        subDays(new Date(), 4),
      );
      // log 5 actionResearchObjectShared interactions in the past 4 days
      claimedBadges = await prisma.interactionLog.createMany({
        data: mockUsersInLast7Days.slice(0, 2).map((user) => ({
          userId: user.user.id,
          action: ActionType.CLAIM_ATTESTATION,
          createdAt: subDays(new Date(), 4),
        })),
      });
      day7ClaimedBadgesLogs = claimedBadges.count;
      // log 5 actionResearchObjectShared interactions in the past 4 days
      day7ProfileViewsLogs = await logMockUserActions(
        mockUsersInLast7Days.slice(0, 5),
        AvailableUserActionLogTypes.actionAuthorProfileViewed,
        subDays(new Date(), 4),
      );
    });

    it('should return the correct feature adoption metrics for today', async () => {
      const selectedDates = {
        from: subDays(new Date(), 1).toISOString(),
        to: new Date().toISOString(),
      };

      const response = await request
        .get('/v1/admin/metrics/feature-adoption-metrics')
        .query({
          from: selectedDates.from,
          to: selectedDates.to,
        })
        .set('Authorization', `Bearer ${admin.token}`);
      const data = response.body.data as FeatureAdoptionMetricsData;

      // assert response status
      expect(response.status).toBe(200);

      // assert publishing users KPIs
      expect(data.totalShares).toBe(day1ShareLogs.length);
      expect(data.totalCoAuthorInvites).toBe(day1CoAuthorInviteLogs.length);
      expect(data.totalAIAnalyticsClicks).toBe(day1AIAnalyticsClicksLogs.length);
      expect(data.totalMatchedArticleClicks).toBe(day1MatchedArticleClicksLogs.length);
      expect(data.totalClaimedBadges).toBe(day1ClaimedBadgesLogs);
      expect(data.totalProfileViews).toBe(day1ProfileViewsLogs.length);
      expect(data.totalGuestModeVisits).toBe(guestUsersToday.length);
    });

    it('should return the correct all time feature adoption metrics', async () => {
      const response = await request
        .get('/v1/admin/metrics/feature-adoption-metrics')
        .set('Authorization', `Bearer ${admin.token}`);
      const data = response.body.data as FeatureAdoptionMetricsData;

      // assert response status
      expect(response.status).toBe(200);

      // assert publishing users KPIs
      expect(data.totalShares).toBe(day1ShareLogs.length + day7ShareLogs.length);
      expect(data.totalCoAuthorInvites).toBe(day1CoAuthorInviteLogs.length + day7CoAuthorInviteLogs.length);
      expect(data.totalAIAnalyticsClicks).toBe(day1AIAnalyticsClicksLogs.length + day7AIAnalyticsClicksLogs.length);
      expect(data.totalMatchedArticleClicks).toBe(
        day1MatchedArticleClicksLogs.length + day7MatchedArticleClicksLogs.length,
      );
      expect(data.totalClaimedBadges).toBe(day1ClaimedBadgesLogs + day7ClaimedBadgesLogs);
      expect(data.totalProfileViews).toBe(day1ProfileViewsLogs.length + day7ProfileViewsLogs.length);
      expect(data.totalGuestModeVisits).toBe(guestUsersToday.length + guestUsersInLast7Days.length);
    });

    it('should return the correct feature adoption metrics for the past 3 days with compareToPreviousPeriod enabled', async () => {
      const selectedDates = {
        from: subDays(new Date(), 3).toISOString(),
        to: new Date().toISOString(),
      };

      const response = await request
        .get('/v1/admin/metrics/feature-adoption-metrics')
        .query({
          from: selectedDates.from,
          to: selectedDates.to,
          compareToPreviousPeriod: true,
        })
        .set('Authorization', `Bearer ${admin.token}`);
      const data = response.body.data as FeatureAdoptionMetricsData;

      // assert response status
      expect(response.status).toBe(200);

      // assert publishing users KPIs
      expect(data.totalShares).toBe(day1ShareLogs.length);
      expect(data.totalCoAuthorInvites).toBe(day1CoAuthorInviteLogs.length);
      expect(data.totalAIAnalyticsClicks).toBe(day1AIAnalyticsClicksLogs.length);
      expect(data.totalMatchedArticleClicks).toBe(day1MatchedArticleClicksLogs.length);
      expect(data.totalClaimedBadges).toBe(day1ClaimedBadgesLogs);
      expect(data.totalProfileViews).toBe(day1ProfileViewsLogs.length);
      expect(data.totalGuestModeVisits).toBe(guestUsersToday.length);
      expect(data.previousPeriod?.totalShares).toBe(day7ShareLogs.length);
      expect(data.previousPeriod?.totalCoAuthorInvites).toBe(day7CoAuthorInviteLogs.length);
      expect(data.previousPeriod?.totalAIAnalyticsClicks).toBe(day7AIAnalyticsClicksLogs.length);
      expect(data.previousPeriod?.totalMatchedArticleClicks).toBe(day7MatchedArticleClicksLogs.length);
      expect(data.previousPeriod?.totalClaimedBadges).toBe(day7ClaimedBadgesLogs);
      expect(data.previousPeriod?.totalProfileViews).toBe(day7ProfileViewsLogs.length);
      expect(data.previousPeriod?.totalGuestModeVisits).toBe(guestUsersInLast7Days.length);
    });
  });
});
