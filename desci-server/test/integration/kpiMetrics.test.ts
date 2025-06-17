import 'dotenv/config';
import 'mocha';

import { AvailableUserActionLogTypes } from '@desci-labs/desci-models';
import {
  ActionType,
  CommunitySubmission,
  DesciCommunity,
  InteractionLog,
  Node,
  NodeVersion,
  Submissionstatus,
  User,
} from '@prisma/client';
// import { Sql } from '@prisma/client/runtime/library.js';
import chai, { assert, use, util } from 'chai';
import chaiAsPromised from 'chai-as-promised';
import {
  eachDayOfInterval,
  eachMonthOfInterval,
  eachWeekOfInterval,
  eachYearOfInterval,
  endOfDay,
  interval,
  startOfDay,
  subDays,
} from 'date-fns';
// import { sql } from 'googleapis/build/src/apis/sql/index.js';
import supertest from 'supertest';
import { v4 as uuidv4 } from 'uuid';

import { prisma } from '../../src/client.js';
import { generateAccessToken } from '../../src/controllers/auth/magic.js';
import { app } from '../../src/index.js';
import { communityService } from '../../src/services/Communities.js';
import { getActiveUsersInRange } from '../../src/services/interactionLog.js';
import { ensureUuidEndsWithDot } from '../../src/utils.js';
import {
  createDraftNode,
  createMockGuestUsers,
  createMockNodes,
  createMockUsers,
  getAllDatesInInterval,
  likeNodes,
  logMockUserActions,
  MockUser,
  publishMockNodes,
  sanitizeBigInts,
  viewNodes,
} from '../util.js';

// use async chai assertions
chai.use(chaiAsPromised);
const expect = chai.expect;

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

  // mock published nodes
  let publishedNodesToday: NodeVersion[];
  let publishedNodesInLast7Days: NodeVersion[];
  let publishedNodesInLast30Days: NodeVersion[];

  // mock community \
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
        researchObjectsCreated: number;
        researchObjectsUpdated: number;
        researchObjectsShared: number;
        researchObjectsPublished: number;
        communityPublications: number;
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
      publishedNodesToday = await publishMockNodes(mockNodesToday.slice(0, 5), new Date());
      // publish 5 nodes in the past 7 days
      publishedNodesInLast7Days = await publishMockNodes(mockNodesInLast7Days.slice(0, 5), subDays(new Date(), 5));
      // publish 7 nodes in the past 30 days
      publishedNodesInLast30Days = await publishMockNodes(mockNodesInLast30Days.slice(0, 7), subDays(new Date(), 28));

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
      console.log(response.body);
      const data = response.body.data as UserEngagementMetricsData;

      // assert response status
      expect(response.status).to.equal(200);

      // assert active users KPIs
      expect(data.activeUsers.daily).to.equal(5);
      expect(data.activeUsers.weekly).to.equal(15);
      expect(data.activeUsers.monthly).to.equal(25);

      // assert publishing users KPIs
      expect(data.publishingUsers.researchObjectsCreated).to.equal(30);
      expect(data.publishingUsers.researchObjectsUpdated).to.equal(5);
      expect(data.publishingUsers.researchObjectsShared).to.equal(10);
      expect(data.publishingUsers.researchObjectsPublished).to.equal(17);
      expect(data.publishingUsers.communityPublications).to.equal(1);

      // assert exploring users KPIs
      expect(data.exploringUsers.daily).to.equal(5);
      expect(data.exploringUsers.weekly).to.equal(10);
      expect(data.exploringUsers.monthly).to.equal(11);
    });
  });

  describe.only('Publish Metrics', () => {
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
      publishedNodesToday = await publishMockNodes(mockNodesToday.slice(0, 5), new Date());
      // publish 50% nodes in the past 7 days
      publishedNodesInLast7Days = await publishMockNodes(mockNodesInLast7Days.slice(0, 5), subDays(new Date(), 5));
      // publish 70% nodes in the past 30 days
      publishedNodesInLast30Days = await publishMockNodes(mockNodesInLast30Days.slice(0, 7), subDays(new Date(), 28));

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
      console.log(response.body);
      const data = response.body.data as PublishMetricsData;

      // assert response status
      expect(response.status).to.equal(200);

      // assert publishing users KPIs
      expect(data.totalUsers).to.equal(
        mockUsersToday.length +
          mockUsersInLast7Days.length +
          mockUsersInLast30Days.length +
          guestUsersToday.length +
          guestUsersInLast7Days.length +
          guestUsersInLast30Days.length +
          1, // admin user
      );
      expect(data.publishers).to.equal(28);
      expect(data.publishersInCommunity).to.equal(16);
      expect(data.guestSignUpSuccessRate).to.equal(50);
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
      console.log(response.body);
      const data = response.body.data as PublishMetricsData;

      // assert response status
      expect(response.status).to.equal(200);

      // assert publishing users KPIs
      expect(data.totalUsers).to.equal(mockUsersToday.length + guestUsersToday.length);
      expect(data.publishers).to.equal(25);
      expect(data.publishersInCommunity).to.equal(25);
      expect(data.guestSignUpSuccessRate).to.equal(50);

      // assert previous period KPIs
      expect(data.previousPeriod?.totalUsers).to.equal(mockUsersInLast7Days.length + guestUsersInLast7Days.length);
      expect(data.previousPeriod?.publishers).to.equal(25);
      expect(data.previousPeriod?.publishersInCommunity).to.equal(25);
      expect(data.previousPeriod?.guestSignUpSuccessRate).to.equal(50);
    });
  });
});
