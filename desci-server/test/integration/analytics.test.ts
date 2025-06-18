import 'dotenv/config';
import 'mocha';

import { AvailableUserActionLogTypes } from '@desci-labs/desci-models';
import { ActionType, InteractionLog, Node, User } from '@prisma/client';
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
import { getActiveUsersInRange } from '../../src/services/interactionLog.js';
import {
  createDraftNode,
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
  await prisma.$queryRaw`TRUNCATE TABLE "Node" CASCADE;`;
  await prisma.$queryRaw`TRUNCATE TABLE "NodeVersion" CASCADE;`;
  await prisma.$queryRaw`TRUNCATE TABLE "InteractionLog" CASCADE;`;
};

describe('Desci Analytics', async () => {
  let mockAdmin: MockUser;

  let request: supertest.SuperTest<supertest.Test>;

  beforeEach(async () => {
    await prisma.$queryRaw`TRUNCATE TABLE "User" CASCADE;`;

    const admin = await prisma.user.create({
      data: {
        email: 'test@desci.com',
        isAdmin: true,
        createdAt: new Date('2020-04-01'),
      },
    });

    mockAdmin = {
      user: admin,
      token: generateAccessToken({ email: admin.email }),
    };

    request = supertest(app);
  });

  afterEach(async () => {
    await clearDatabase();
  });

  describe('Users analytics', async () => {
    it('should count users accurately', async () => {
      // insert several users across the last week
      for (let i = 0; i < 10; i++) {
        for (let j = 0; j < i + 1; j++) {
          await prisma.user.create({
            data: {
              email: `test${i}_${j}@test.com`,
              createdAt: subDays(new Date(), j),
            },
          });
        }
      }

      // print database counts of user per day
      // const userCounts =
      //   (await prisma.$queryRaw`SELECT COUNT(1), DATE("createdAt" )::text AS d       FROM "User"       GROUP BY d        ORDER BY d DESC`) as {
      //     count: number;
      //     d: string;
      //   }[];
      // console.log(JSON.stringify(sanitizeBigInts(userCounts), null, 2));

      // ensure the counts are correct in analytics controller route /admin/analytics
      const response = await request.get('/v1/admin/analytics').set('authorization', `Bearer ${mockAdmin.token}`);
      // console.log(JSON.stringify(sanitizeBigInts(response.body), null, 2));

      expect(response.status).to.equal(200);
      expect(response.body.newUsersToday).to.equal(10);
    });

    it('should count users accurately in aggregate route', async () => {
      for (let i = 0; i < 10; i++) {
        for (let j = 0; j < i + 1; j++) {
          const createdAt = subDays(new Date(), j);
          // console.log(`Adding user ${i}_${j} at ${createdAt}`);
          await prisma.user.create({
            data: {
              email: `test_agg_${i}_${j}@test.com`,
              createdAt: createdAt,
            },
          });
        }
      }

      // const userCounts =
      //   (await prisma.$queryRaw`SELECT COUNT(1), DATE("createdAt" )::text AS d       FROM "User"       GROUP BY d        ORDER BY d DESC`) as {
      //     count: number;
      //     d: string;
      //   }[];
      // console.log(JSON.stringify(sanitizeBigInts(userCounts), null, 2));

      const today = new Date();
      const endDate = new Date(today); // End of today
      endDate.setHours(23, 59, 59, 999);
      const startDate = subDays(today, 6); // Start of 6 days ago
      startDate.setHours(0, 0, 0, 0);

      const fromDate = encodeURIComponent(startDate.toISOString());
      const toDate = encodeURIComponent(endDate.toISOString());

      const response = await request
        .get(`/v1/admin/analytics/query?from=${fromDate}&to=${toDate}&interval=daily`)
        .set('authorization', `Bearer ${mockAdmin.token}`);
      // console.log(JSON.stringify(sanitizeBigInts(response.body), null, 2));

      expect(response.status).to.equal(200);
      expect(response.body.data.analytics).to.be.an('array').with.lengthOf(7);
      expect(response.body.data.analytics[0].newUsers).to.equal(4); // 6 days ago (j=6)
      expect(response.body.data.analytics[1].newUsers).to.equal(5); // 5 days ago (j=5)
      expect(response.body.data.analytics[2].newUsers).to.equal(6); // 4 days ago (j=4)
      expect(response.body.data.analytics[3].newUsers).to.equal(7); // 3 days ago (j=3)
      expect(response.body.data.analytics[4].newUsers).to.equal(8); // 2 days ago (j=2)
      expect(response.body.data.analytics[5].newUsers).to.equal(9); // yesterday (j=1)
      expect(response.body.data.analytics[6].newUsers).to.equal(10); // today (j=0)
    });

    it('should count active users accurately', async () => {
      // create 10 users
      const users = await createMockUsers(10, subDays(new Date(), 30));

      // add 2 active user interactions today
      await logMockUserActions(users.slice(0, 2), AvailableUserActionLogTypes.search, new Date());

      // add 7 active user (5 unique users) interactions in the past 7 days
      await logMockUserActions(users.slice(0, 7), AvailableUserActionLogTypes.search, subDays(new Date(), 5));

      // add 10 active user (3 unique users) interactions in the past 30 days
      await logMockUserActions(users, AvailableUserActionLogTypes.search, subDays(new Date(), 25));

      // ensure the counts are correct in analytics controller route /admin/analytics
      const response = await request.get('/v1/admin/analytics').set('authorization', `Bearer ${mockAdmin.token}`);
      console.log(JSON.stringify(sanitizeBigInts(response.body), null, 2));

      expect(response.status).to.equal(200);
      expect(response.body.activeUsersToday, 'active users today').to.equal(2, 'expected 2 active users today');
      expect(response.body.activeUsersInLast7Days, 'active users in last 7 days').to.equal(
        7,
        'expected 7 active users in last 7 days',
      );
      expect(response.body.activeUsersInLast30Days, 'active users in last 30 days').to.equal(
        10,
        'expected 10 active users in last 30 days',
      );
    });

    it('should count active users with orcid accurately', async () => {
      // create 10 users
      const newOrcidUsersToday = await createMockUsers(1, new Date(), true);
      const newOrcidUsersInLast7Days = await createMockUsers(5, subDays(new Date(), 5), true);
      const newOrcidUsersInLast30Days = await createMockUsers(3, subDays(new Date(), 27), true);

      // ensure the counts are correct in analytics controller route /admin/analytics
      let response = await request.get('/v1/admin/analytics').set('authorization', `Bearer ${mockAdmin.token}`);
      // console.log(JSON.stringify(sanitizeBigInts(response.body), null, 2));

      // check new orcid user stats
      expect(response.status).to.equal(200);
      expect(1).to.equal(response.body.newOrcidUsersToday, 'expected 1 new orcid users today');
      expect(6).to.equal(response.body.newOrcidUsersInLast7Days, 'new orcid users in last 7 days');
      expect(9).to.equal(response.body.newOrcidUsersInLast30Days, 'new orcid users in last 30 days');

      // add 2 active user interactions today
      await logMockUserActions(newOrcidUsersToday, AvailableUserActionLogTypes.search, new Date());
      // add 5 active user interactions in the past 7 days
      await logMockUserActions(newOrcidUsersInLast7Days, AvailableUserActionLogTypes.search, subDays(new Date(), 5));

      // add 3 active user interactions in the past 30 days
      await logMockUserActions(newOrcidUsersInLast30Days, AvailableUserActionLogTypes.search, subDays(new Date(), 25));

      // ensure the counts are correct in analytics controller route /admin/analytics
      response = await request.get('/v1/admin/analytics').set('authorization', `Bearer ${mockAdmin.token}`);
      // console.log(JSON.stringify(sanitizeBigInts(response.body), null, 2));

      // check active orcid user stats
      expect(1).to.equal(response.body.activeOrcidUsersToday, 'active orcid users today');
      expect(6).to.equal(response.body.activeOrcidUsersInLast7Days, 'active orcid users in last 7 days');
      expect(9).to.equal(response.body.activeOrcidUsersInLast30Days, 'active orcid users in last 30 days');
    });
  });

  describe('Nodes analytics', async () => {
    let mockNodes: Node[];
    let mockUsers: MockUser[];
    let nodesToday: Node[];
    let nodesInLast7Days: Node[];
    let nodesInLast30Days: Node[];

    beforeEach(async () => {
      mockUsers = await createMockUsers(10, subDays(new Date(), 30));

      // create 3 nodes today
      nodesToday = await createMockNodes(mockUsers.slice(0, 3), new Date());
      // create 5 nodes in the past 7 days
      nodesInLast7Days = await createMockNodes(mockUsers.slice(0, 5), subDays(new Date(), 5));
      // create 10 nodes in the past 30 days
      nodesInLast30Days = await createMockNodes(mockUsers, subDays(new Date(), 28));
      mockNodes = [...nodesToday, ...nodesInLast7Days, ...nodesInLast30Days];
    });

    it('should count nodes accurately', async () => {
      const response = await request.get('/v1/admin/analytics').set('authorization', `Bearer ${mockAdmin.token}`);
      // console.log(JSON.stringify(sanitizeBigInts(response.body), null, 2));

      expect(response.status).to.equal(200);
      expect(response.body.newNodesToday).to.equal(3);
      expect(response.body.newNodesInLast7Days).to.equal(8);
      expect(response.body.newNodesInLast30Days).to.equal(18);
    });

    it('should count node views accurately', async () => {
      await viewNodes(mockNodes, mockUsers[0].user.id, new Date());
      await viewNodes(mockNodes.slice(0, 5), mockUsers[1].user.id, subDays(new Date(), 5));
      await viewNodes(mockNodes.slice(0, 8), mockUsers[2].user.id, subDays(new Date(), 28));

      let res =
        await prisma.$queryRaw`select count(1) as count from "InteractionLog" z where action = 'USER_ACTION' and extra::jsonb->'action' = '"viewedNode"'::jsonb and "createdAt" >= ${startOfDay(subDays(new Date(), 1))}`;
      const expectedNodeViewsToday = (res as any[])[0].count as number;

      res =
        await prisma.$queryRaw`select count(1) as count from "InteractionLog" z where action = 'USER_ACTION' and extra::jsonb->'action' = '"viewedNode"'::jsonb and "createdAt" >= ${startOfDay(subDays(new Date(), 7))}`;
      const expectedNodeViewsInLast7Days = (res as any[])[0].count as number;

      res =
        await prisma.$queryRaw`select count(1) as count from "InteractionLog" z where action = 'USER_ACTION' and extra::jsonb->'action' = '"viewedNode"'::jsonb and "createdAt" >= ${startOfDay(subDays(new Date(), 30))}`;
      const expectedNodeViewsInLast30Days = (res as any[])[0].count as number;

      const response = await request.get('/v1/admin/analytics').set('authorization', `Bearer ${mockAdmin.token}`);
      // console.log(JSON.stringify(sanitizeBigInts(response.body), null, 2));

      expect(response.status).to.equal(200);
      expect(response.body.nodeViewsToday).to.equal(Number(expectedNodeViewsToday.toString()));
      expect(response.body.nodeViewsInLast7Days).to.equal(Number(expectedNodeViewsInLast7Days.toString()));
      expect(response.body.nodeViewsInLast30Days).to.equal(Number(expectedNodeViewsInLast30Days.toString()));
    });

    it('should count node likes accurately', async () => {
      await likeNodes(mockNodes, mockUsers[0].user.id, new Date());
      await likeNodes(mockNodes.slice(0, 5), mockUsers[1].user.id, subDays(new Date(), 5));
      await likeNodes(mockNodes.slice(0, 8), mockUsers[2].user.id, subDays(new Date(), 28));

      const response = await request.get('/v1/admin/analytics').set('authorization', `Bearer ${mockAdmin.token}`);
      // console.log(JSON.stringify(sanitizeBigInts(response.body), null, 2));

      expect(response.status).to.equal(200);
      expect(response.body.nodeLikesToday).to.equal(18);
      expect(response.body.nodeLikesInLast7Days).to.equal(23);
      expect(response.body.nodeLikesInLast30Days).to.equal(31);
    });

    it('should count published nodes accurately', async () => {
      // console.log('should count published nodes accurately', { mockNodes });
      await publishMockNodes(mockNodes.slice(0, 5), new Date());
      await publishMockNodes(mockNodes.slice(0, 8), subDays(new Date(), 5));
      await publishMockNodes(mockNodes, subDays(new Date(), 28));

      let res =
        await prisma.$queryRaw`SELECT COUNT(DISTINCT nv."nodeId") FROM "NodeVersion" nv WHERE "createdAt" >= ${startOfDay(new Date())}`;
      const expectedPublishedNodesToday = (res as any[])[0].count as number;

      res =
        await prisma.$queryRaw`SELECT COUNT(DISTINCT nv."nodeId") FROM "NodeVersion" nv WHERE "createdAt" >= ${startOfDay(subDays(new Date(), 7))}`;
      const expectedPublishedNodesInLast7Days = (res as any[])[0].count as number;

      res =
        await prisma.$queryRaw`SELECT COUNT(DISTINCT nv."nodeId") FROM "NodeVersion" nv WHERE "createdAt" >= ${startOfDay(subDays(new Date(), 30))}`;
      const expectedPublishedNodesInLast30Days = (res as any[])[0].count as number;

      const alternate7DaysResult = await prisma.nodeVersion.groupBy({
        by: ['nodeId'],
        _count: {
          // _all: true,
          createdAt: true,
        },
        where: {
          createdAt: {
            gte: startOfDay(subDays(new Date(), 7)),
            lt: endOfDay(new Date()),
          },
        },
      });

      // console.log(
      //   sanitizeBigInts({
      //     alternate7DaysResult,
      //     expectedPublishedNodesToday, // 5
      //     expectedPublishedNodesInLast7Days, // 8
      //     expectedPublishedNodesInLast30Days, // 18
      //   }),
      // );

      const response = await request.get('/v1/admin/analytics').set('authorization', `Bearer ${mockAdmin.token}`);
      // console.log(JSON.stringify(sanitizeBigInts(response.body), null, 2));

      expect(response.status).to.equal(200);
      expect(response.body.publishedNodesToday).to.equal(Number(expectedPublishedNodesToday.toString()));
      expect(response.body.publishedNodesInLast7Days).to.equal(Number(expectedPublishedNodesInLast7Days.toString()));
      expect(response.body.publishedNodesInLast30Days).to.equal(Number(expectedPublishedNodesInLast30Days.toString()));
    });

    it('should only count distinct nodes published within a period', async () => {
      await publishMockNodes(mockNodes.slice(0, 8), subDays(new Date(), 5));

      let res =
        await prisma.$queryRaw`SELECT COUNT(DISTINCT nv."nodeId") FROM "NodeVersion" nv WHERE "createdAt" >= ${startOfDay(new Date())}`;
      const expectedPublishedNodesToday = (res as any[])[0].count as number;

      res =
        await prisma.$queryRaw`SELECT COUNT(DISTINCT nv."nodeId") FROM "NodeVersion" nv WHERE "createdAt" >= ${startOfDay(subDays(new Date(), 7))}`;
      const expectedPublishedNodesInLast7Days = (res as any[])[0].count as number;

      res =
        await prisma.$queryRaw`SELECT COUNT(DISTINCT nv."nodeId") FROM "NodeVersion" nv WHERE "createdAt" >= ${startOfDay(subDays(new Date(), 30))}`;
      const expectedPublishedNodesInLast30Days = (res as any[])[0].count as number;

      // console.log(
      //   sanitizeBigInts({
      //     expectedPublishedNodesToday,
      //     expectedPublishedNodesInLast7Days,
      //     expectedPublishedNodesInLast30Days,
      //   }),
      // );

      const response = await request.get('/v1/admin/analytics').set('authorization', `Bearer ${mockAdmin.token}`);
      // console.log(JSON.stringify(sanitizeBigInts(response.body), null, 2));
      expect(response.status).to.equal(200);
      expect(response.body.publishedNodesToday).to.equal(Number(expectedPublishedNodesToday.toString()));
      expect(response.body.publishedNodesInLast7Days).to.equal(Number(expectedPublishedNodesInLast7Days.toString()));
      expect(response.body.publishedNodesInLast30Days).to.equal(Number(expectedPublishedNodesInLast30Days.toString()));
    });
  });

  describe('Analytics aggregate calculation', async () => {
    let mockNodes: Node[];
    let mockUsers: MockUser[];
    let nodesToday: Node[];
    let nodesInLast7Days: Node[];
    let nodesInLast30Days: Node[];
    let usersToday: MockUser[];
    let usersInLast7Days: MockUser[];
    let usersInLast30Days: MockUser[];
    let orcidUsersToday: MockUser[];
    let orcidUsersInLast7Days: MockUser[];
    let orcidUsersInLast30Days: MockUser[];
    let userInteractionsToday: InteractionLog[];
    let userInteractionsInLast7Days: InteractionLog[];
    let userInteractionsInLast30Days: InteractionLog[];
    let orcidUsersInteractionsToday: InteractionLog[];
    let orcidUsersInteractionsInLast7Days: InteractionLog[];
    let orcidUsersInteractionsInLast30Days: InteractionLog[];

    beforeEach(async () => {
      mockUsers = await createMockUsers(10, subDays(new Date(), 60));

      // create 3 nodes today
      nodesToday = await createMockNodes(mockUsers.slice(0, 3), new Date());
      // create 5 nodes in the past 7 days
      nodesInLast7Days = await createMockNodes(mockUsers.slice(0, 5), subDays(new Date(), 5));
      // create 10 nodes in the past 30 days
      nodesInLast30Days = await createMockNodes(mockUsers, subDays(new Date(), 28));
      mockNodes = [...nodesToday, ...nodesInLast7Days, ...nodesInLast30Days];

      // create 5 users today
      usersToday = await createMockUsers(5, new Date());
      // create 7 users in the past 7 days
      usersInLast7Days = await createMockUsers(7, subDays(new Date(), 5));
      // create 10 users in the past 30 days
      usersInLast30Days = await createMockUsers(10, subDays(new Date(), 28));

      // create 2 orcid users today
      orcidUsersToday = await createMockUsers(2, new Date(), true);
      // create 5 orcid users in the past 7 days
      orcidUsersInLast7Days = await createMockUsers(5, subDays(new Date(), 5), true);
      // create 10 orcid users in the pa  st 30 days
      orcidUsersInLast30Days = await createMockUsers(10, subDays(new Date(), 28), true);

      // add 2 active user interactions today
      userInteractionsToday = await logMockUserActions(
        usersToday.slice(0, 2),
        AvailableUserActionLogTypes.search,
        new Date(),
      );

      // add 7 active user (5 unique users) interactions in the past 7 days
      userInteractionsInLast7Days = await logMockUserActions(
        usersInLast7Days.slice(0, 7),
        AvailableUserActionLogTypes.search,
        subDays(new Date(), 5),
      );

      // add 10 active user (3 unique users) interactions in the past 30 days
      userInteractionsInLast30Days = await logMockUserActions(
        usersInLast30Days,
        AvailableUserActionLogTypes.search,
        subDays(new Date(), 25),
      );

      // add 2 active user interactions today
      orcidUsersInteractionsToday = await logMockUserActions(
        orcidUsersToday,
        AvailableUserActionLogTypes.search,
        new Date(),
      );

      // add 7 active user (5 unique users) interactions in the past 7 days
      orcidUsersInteractionsInLast7Days = await logMockUserActions(
        orcidUsersInLast7Days,
        AvailableUserActionLogTypes.search,
        subDays(new Date(), 5),
      );

      // add 10 active user (3 unique users) interactions in the past 30 days
      orcidUsersInteractionsInLast30Days = await logMockUserActions(
        orcidUsersInLast30Days.slice(0, 8),
        AvailableUserActionLogTypes.search,
        subDays(new Date(), 25),
      );

      // create 5 node views today
      await viewNodes(nodesInLast7Days.slice(0, 5), usersToday[0].user.id, new Date());
      // create 10 node views in the past 7 days
      await viewNodes(nodesInLast30Days.slice(0, 10), usersInLast7Days[1].user.id, subDays(new Date(), 5));
      // create 10 node views in the past 30 days
      await viewNodes(nodesInLast30Days, usersInLast30Days[2].user.id, subDays(new Date(), 28));

      // create 10 node likes today
      await likeNodes(mockNodes.slice(0, 10), mockUsers[0].user.id, new Date());
      // create 15 node likes in the past 7 days
      await likeNodes(mockNodes.slice(0, 15), mockUsers[1].user.id, subDays(new Date(), 5));
      // create 20 node likes in the past 30 days
      await likeNodes(mockNodes, mockUsers[2].user.id, subDays(new Date(), 28));

      // create 2 published nodes today
      await publishMockNodes(mockNodes.slice(0, 2), new Date());
      // create 8 published nodes in the past 7 days
      await publishMockNodes(mockNodes.slice(0, 8), subDays(new Date(), 5));
      // create 10 published nodes in the past 30 days
      await publishMockNodes(mockNodes.slice(0, 10), subDays(new Date(), 28));
    });

    it('should aggregate analytics today accurately', async () => {
      const selectedDates = {
        from: new Date().toISOString(),
        to: new Date().toISOString(),
      };
      const timeInterval = 'daily';

      const allDatesInInterval = getAllDatesInInterval(selectedDates, timeInterval);
      const response = await request
        .get(
          `/v1/admin/analytics/query?to=${encodeURIComponent(selectedDates.to)}&from=${encodeURIComponent(selectedDates.from)}&interval=${timeInterval}`,
        )
        .set('authorization', `Bearer ${mockAdmin.token}`);
      console.log(JSON.stringify(sanitizeBigInts(response.body), null, 2), allDatesInInterval);
      console.log({ allDatesInInterval });
      expect(response.status).to.equal(200);

      // add assertions for today here
      expect(response.body.data.analytics)
        .to.be.an('array')
        .with.lengthOf(allDatesInInterval?.length ?? 1);
      expect(response.body.data.analytics[0].newUsers, 'new users today').to.equal(
        usersToday.length + orcidUsersToday.length,
      ); // sum of users today and orcid users today
      expect(response.body.data.analytics[0].newNodes, 'new nodes today').to.equal(nodesToday.length); // sum of nodes today
      expect(response.body.data.analytics[0].nodeViews, 'node views today').to.equal(5); // sum of node views today
      expect(response.body.data.analytics[0].nodeLikes, 'node likes today').to.equal(10); // sum of node likes today

      const publishesToday = (await prisma.$queryRaw`
      SELECT
        DISTINCT nv."nodeId",
        MAX(nv."createdAt") AS "createdAt"
        FROM
            "Node" node
            JOIN "NodeVersion" nv ON nv."createdAt" >= ${startOfDay(new Date())}
            AND nv."createdAt" < ${endOfDay(new Date())}
            AND (
                nv."transactionId" IS NOT NULL
                OR nv."commitId" IS NOT NULL
        )
      GROUP BY
      nv."nodeId";
        `) as { nodeId: number; created: string }[];
      console.log({ publishesToday });

      assert(userInteractionsToday.length > 0);

      expect(response.body.data.analytics[0].publishedNodes, 'published nodes today').to.equal(2); // sum of published nodes today
      expect(response.body.data.analytics[0].activeUsers, 'active users today').to.equal(
        userInteractionsToday.length + orcidUsersInteractionsToday.length,
      ); // sum of user interactions today and orcid user interactions today
      expect(response.body.data.analytics[0].activeOrcidUsers, 'active orcid users today').to.equal(
        orcidUsersInteractionsToday.length,
      ); // sum of orcid user interactions today
    });

    it('should aggregate analytics in last 7 days accurately', async () => {
      const selectedDates = {
        from: subDays(new Date(), 7).toISOString(),
        to: new Date().toISOString(),
      };
      const timeInterval = 'daily';
      const allDatesInInterval = getAllDatesInInterval(selectedDates, timeInterval);

      const response = await request
        .get(
          `/v1/admin/analytics/query?to=${encodeURIComponent(selectedDates.to)}&from=${encodeURIComponent(selectedDates.from)}&interval=${timeInterval}`,
        )
        .set('authorization', `Bearer ${mockAdmin.token}`);
      console.log(JSON.stringify(sanitizeBigInts(response.body), null, 2));
      console.log({ allDatesInInterval });
      expect(response.status).to.equal(200);
      const analytics = response.body.data.analytics.reverse();

      const publishesInLast7Days = (await prisma.$queryRaw`
      SELECT
        DISTINCT nv."nodeId",
        MAX(nv."createdAt") AS "createdAt"
        FROM
            "Node" node
            JOIN "NodeVersion" nv ON nv."createdAt" >= ${startOfDay(subDays(new Date(), 7))}
            AND nv."createdAt" < ${endOfDay(new Date())}
            AND (
                nv."transactionId" IS NOT NULL
                OR nv."commitId" IS NOT NULL
        )
      GROUP BY
      nv."nodeId";
        `) as { nodeId: number; created: string }[];
      console.log({ publishesInLast7Days });

      // add assertions for last 7 days here
      expect(analytics, 'analytics array length')
        .to.be.an('array')
        .with.lengthOf(allDatesInInterval?.length ?? 8);
      expect(analytics[0].newUsers, 'new users today').to.equal(usersToday.length + orcidUsersToday.length); // sum of users today and orcid users today
      expect(analytics[0].newNodes, 'new nodes today').to.equal(nodesToday.length); // sum of nodes today
      expect(analytics[0].nodeViews, 'node views today').to.equal(5); // sum of node views today
      expect(analytics[0].nodeLikes, 'node likes today').to.equal(10); // sum of node likes today
      expect(analytics[0].publishedNodes, 'published nodes').to.equal(2); // sum of published nodes today
      expect(analytics[0].activeUsers, 'active users').to.equal(
        userInteractionsToday.length + orcidUsersInteractionsToday.length,
      ); // sum of user interactions today and orcid user interactions today
      expect(analytics[0].activeOrcidUsers, 'active orcid users').to.equal(orcidUsersInteractionsToday.length); // sum of orcid user interactions today

      expect(analytics[5].newUsers, 'new users in last 7 days').to.equal(
        usersInLast7Days.length + orcidUsersInLast7Days.length,
      ); // sum of users in last 7 days and orcid users in last 7 days
      expect(analytics[5].newNodes, 'new nodes on day 5').to.equal(nodesInLast7Days.length); // sum of nodes today and nodes in last 7 days
      expect(analytics[5].nodeViews, 'node views on day 5').to.equal(10); // sum of node views in last 7 days
      expect(analytics[5].nodeLikes, 'node likes on day 5').to.equal(15); // sum of node likes in last 7 days
      expect(analytics[5].publishedNodes, 'published nodes on day 5').to.equal(6); // sum of published nodes in last 7 days
      expect(analytics[5].activeUsers, 'active users on day 5').to.equal(
        userInteractionsInLast7Days.length + orcidUsersInteractionsInLast7Days.length,
      ); // sum of user interactions in last 7 days and orcid user interactions in last 7 days
      expect(response.body.data.analytics[5].activeOrcidUsers, 'active orcid user on day 5').to.equal(
        orcidUsersInteractionsInLast7Days.length,
      ); // sum of orcid user interactions in last 7 days
    });

    it('should aggregate analytics in last 30 days accurately', async () => {
      // test for last 30 days
      const selectedDates = {
        from: subDays(new Date(), 30).toISOString(),
        to: new Date().toISOString(),
      };
      const timeInterval = 'weekly';
      const allDatesInInterval = getAllDatesInInterval(selectedDates, timeInterval);

      const response = await request
        .get(
          `/v1/admin/analytics/query?to=${encodeURIComponent(selectedDates.to)}&from=${encodeURIComponent(selectedDates.from)}&interval=${timeInterval}`,
        )
        .set('authorization', `Bearer ${mockAdmin.token}`);
      console.log(JSON.stringify(sanitizeBigInts(response.body), null, 2));
      console.log({ allDatesInInterval });

      const publishesInLast30Days = (await prisma.$queryRaw`
      SELECT
        DISTINCT nv."nodeId",
        MAX(nv."createdAt") AS "createdAt"
        FROM
            "Node" node
            JOIN "NodeVersion" nv ON nv."createdAt" >= ${startOfDay(subDays(new Date(), 30))}
            AND nv."createdAt" < ${endOfDay(new Date())}
            AND (
                nv."transactionId" IS NOT NULL
                OR nv."commitId" IS NOT NULL
        )
      GROUP BY
      nv."nodeId";
        `) as { nodeId: number; created: string }[];
      console.log({ publishesInLast30Days });

      expect(response.status).to.equal(200);
      // add assertions for last 30 days here
      const analytics = response.body.data.analytics.reverse();
      console.log({ analytics });
      expect(analytics)
        .to.be.an('array')
        .with.lengthOf(allDatesInInterval?.length ?? 5);
      expect(analytics[0].newUsers, 'new users this week').to.equal(usersToday.length + orcidUsersToday.length); // sum of users today and orcid users today
      expect(analytics[0].newNodes, 'new nodes this week').to.equal(nodesToday.length); // sum of nodes today
      expect(analytics[0].nodeViews, 'node views this week').to.equal(5); // sum of node views today
      expect(analytics[0].nodeLikes, 'node likes this week').to.equal(10); // sum of node likes today
      expect(analytics[0].publishedNodes, 'published nodes this week').to.equal(2); // sum of published nodes today
      expect(analytics[0].activeUsers, 'active users this week').to.equal(
        userInteractionsToday.length + orcidUsersInteractionsToday.length,
      ); // sum of user interactions in last 7 days and orcid user interactions in last 7 days
      expect(analytics[0].activeOrcidUsers, 'active orcid users this week').to.equal(
        orcidUsersInteractionsToday.length,
      ); // sum of orcid user interactions in last 7 days

      expect(analytics[4].newUsers, 'new users 4 weeks ago').to.equal(
        usersInLast30Days.length + orcidUsersInLast30Days.length,
      ); // sum of users today and orcid users today
      expect(analytics[4].newOrcidUsers, 'new orcid users 4 weeks ago').to.equal(orcidUsersInLast30Days.length); // sum of orcid users today
      expect(analytics[4].newNodes, 'new nodes 4 weeks ago').to.equal(nodesInLast30Days.length); // sum of nodes today
      expect(analytics[4].nodeViews, 'node views 4 weeks ago').to.equal(10); // sum of node views today
      expect(analytics[4].nodeLikes, 'node likes 4 weeks ago').to.equal(mockNodes.length); // sum of node likes today
      expect(analytics[4].publishedNodes, 'published nodes 4 weeks ago').to.equal(2); // sum of published nodes today

      // const actualActiveUsers4WeeksAgo = await getActiveUsersInRange({
      //   from: startOfDay(subDays(new Date(), 30)),
      //   to: endOfDay(new Date()),
      // });
      // console.log({ actualActiveUsers4WeeksAgo });
      // expect(analytics[4].activeUsers, 'active users 4 weeks ago').to.equal(
      //   userInteractionsInLast30Days.length + orcidUsersInteractionsInLast30Days.length,
      // ); // sum of user interactions in last 30 days and orcid user interactions in last 30 days
      // expect(analytics[4].activeOrcidUsers, 'active orcid users 4 weeks ago').to.equal(
      //   orcidUsersInteractionsInLast30Days.length,
      // ); // sum of orcid user interactions in last 30 days
    });
  });
});
