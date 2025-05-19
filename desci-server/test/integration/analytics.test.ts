import 'dotenv/config';
import 'mocha';

import { AvailableUserActionLogTypes } from '@desci-labs/desci-models';
import { ActionType, InteractionLog, Node, User } from '@prisma/client';
import { Sql } from '@prisma/client/runtime/library.js';
import chai, { util } from 'chai';
import chaiAsPromised from 'chai-as-promised';
import { subDays } from 'date-fn-latest';
import { sql } from 'googleapis/build/src/apis/sql/index.js';
import supertest from 'supertest';

import { prisma } from '../../src/client.js';
import { generateAccessToken } from '../../src/controllers/auth/magic.js';
import { app } from '../../src/index.js';
import { createDraftNode } from '../util.js';

// use async chai assertions
chai.use(chaiAsPromised);
const expect = chai.expect;

const clearDatabase = async () => {
  await prisma.$queryRaw`TRUNCATE TABLE "User" CASCADE;`;
  await prisma.$queryRaw`TRUNCATE TABLE "Node" CASCADE;`;
  await prisma.$queryRaw`TRUNCATE TABLE "NodeVersion" CASCADE;`;
  await prisma.$queryRaw`TRUNCATE TABLE "InteractionLog" CASCADE;`;
};

interface MockUser {
  user: User;
  token: string;
}

const randomInt = (min: number, max: number) => {
  return Math.floor(Math.random() * (max - min + 1)) + min;
};

// generate a random orcid
const generateOrcid = () => {
  return `0000-000${randomInt(1, 9)}-80${randomInt(1, 9)}0-${randomInt(1, 9)}${randomInt(1, 9)}${randomInt(1, 9)}X`;
};

const createMockUsers = async (count: number, createdAt: Date, withOrcid?: boolean): Promise<MockUser[]> => {
  const promises = new Array(count).fill(0).map((_, index) =>
    prisma.user.create({
      data: {
        email: `user${index}_${randomInt(1, 1000000)}@test.com`,
        name: `User_${index}_${randomInt(1, 1000000)}`,
        createdAt,
        ...(withOrcid ? { orcid: generateOrcid() } : {}),
      },
    }),
  );

  const users = await Promise.all(promises);
  return users.map((user) => ({
    user,
    token: generateAccessToken({ email: user.email }),
  }));
};

const logMockUserActions = async (
  users: MockUser[],
  action: AvailableUserActionLogTypes,
  date: Date,
): Promise<InteractionLog[]> => {
  const promises = users.map((entry, index) =>
    prisma.interactionLog.create({
      data: {
        userId: entry.user.id,
        createdAt: date,
        action: ActionType.USER_ACTION,
        extra: JSON.stringify({
          action,
        }),
      },
    }),
  );

  const interactions = await Promise.all(promises);
  return interactions;
};

describe('Desci Analytics', async () => {
  let mockAdmin: MockUser;
  let mockUsers: MockUser[];
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

    mockUsers = await createMockUsers(10, subDays(new Date(), 30));

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
      const userCounts =
        (await prisma.$queryRaw`SELECT COUNT(1), DATE("createdAt" )::text AS d       FROM "User"       GROUP BY d        ORDER BY d DESC`) as {
          count: number;
          d: string;
        }[];
      console.log(JSON.stringify(sanitizeBigInts(userCounts), null, 2));

      // ensure the counts are correct in analytics controller route /admin/analytics
      const response = await request.get('/v1/admin/analytics').set('authorization', `Bearer ${mockAdmin.token}`);
      console.log(JSON.stringify(sanitizeBigInts(response.body), null, 2));

      expect(response.status).to.equal(200);
      expect(response.body.newUsersToday).to.equal(10);
    });

    it('should count users accurately in aggregate route', async () => {
      for (let i = 0; i < 10; i++) {
        for (let j = 0; j < i + 1; j++) {
          const createdAt = subDays(new Date(), j);
          console.log(`Adding user ${i}_${j} at ${createdAt}`);
          await prisma.user.create({
            data: {
              email: `test_agg_${i}_${j}@test.com`,
              createdAt: createdAt,
            },
          });
        }
      }

      const userCounts =
        (await prisma.$queryRaw`SELECT COUNT(1), DATE("createdAt" )::text AS d       FROM "User"       GROUP BY d        ORDER BY d DESC`) as {
          count: number;
          d: string;
        }[];
      console.log(JSON.stringify(sanitizeBigInts(userCounts), null, 2));

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
      console.log(JSON.stringify(sanitizeBigInts(response.body), null, 2));

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
      console.log({ newOrcidUsersToday: newOrcidUsersToday.map((u) => u.user) });
      const newOrcidUsersInLast7Days = await createMockUsers(5, subDays(new Date(), 5), true);
      console.log({ newOrcidUsersInLast7Days: newOrcidUsersInLast7Days.map((u) => u.user) });
      const newOrcidUsersInLast30Days = await createMockUsers(3, subDays(new Date(), 27), true);
      console.log({ newOrcidUsersInLast30Days: newOrcidUsersInLast30Days.map((u) => u.user) });

      // ensure the counts are correct in analytics controller route /admin/analytics
      let response = await request.get('/v1/admin/analytics').set('authorization', `Bearer ${mockAdmin.token}`);
      console.log(JSON.stringify(sanitizeBigInts(response.body), null, 2));

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
      console.log(JSON.stringify(sanitizeBigInts(response.body), null, 2));

      // check active orcid user stats
      expect(1).to.equal(response.body.activeUsersToday, 'active orcid users today');
      expect(6).to.equal(response.body.activeUsersInLast7Days, 'active orcid users in last 7 days');
      expect(9).to.equal(response.body.activeUsersInLast30Days, 'active orcid users in last 30 days');
    });
  });

  describe('Nodes analytics', async () => {
    let mockNodes: Node[];

    beforeEach(async () => {
      // mockNodes = await createMockNodes(mockUsers, subDays(new Date(), 28));
    });
    it('should count nodes accurately', async () => {
      await createMockNodes(mockUsers.slice(0, 3), new Date());
      await createMockNodes(mockUsers.slice(0, 5), subDays(new Date(), 5));
      await createMockNodes(mockUsers, subDays(new Date(), 28));

      const response = await request.get('/v1/admin/analytics').set('authorization', `Bearer ${mockAdmin.token}`);
      console.log(JSON.stringify(sanitizeBigInts(response.body), null, 2));

      expect(response.status).to.equal(200);
      expect(response.body.newNodesToday).to.equal(3);
      expect(response.body.newNodesInLast7Days).to.equal(8);
      expect(response.body.newNodesInLast30Days).to.equal(18);
    });

    it('should count node views accurately', async () => {});

    it('should count node likes accurately', async () => {});

    it('should count published nodes accurately', async () => {});

    it('should only count distinct nodes published within a period', async () => {});

    it('should count node likes accurately', async () => {});

    it('should aggregate new|views|likes|published nodes accurately', async () => {});
  });
});

function sanitizeBigInts(obj: any): any {
  if (Array.isArray(obj)) {
    return obj.map(sanitizeBigInts);
  } else if (obj && typeof obj === 'object') {
    return Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, sanitizeBigInts(v)]));
  } else if (typeof obj === 'bigint') {
    return obj.toString();
  } else {
    return obj;
  }
}

function createMockNodes(users: MockUser[], createdAt: Date) {
  return Promise.all(
    users.map((owner, i) =>
      createDraftNode({
        title: `Test Node ${randomInt(1, 1000000)}`,
        createdAt,
        ownerId: owner.user.id,
        manifestUrl: `bafkreibhcuvtojyratsjpqvte7lyxgcbluwi7p4c5ogs4lluyrdiurgmdi`,
        replicationFactor: 1,
      }),
    ),
  );
}

function publishMockNode(node: Node) {
  return prisma.nodeVersion.create({
    data: {
      nodeId: node.id,
      manifestUrl: node.manifestUrl,
      createdAt: new Date(),
      commitId: 'k3y52mos6605bnn40br13xp3gu5gbgbcktw1zlww98ha346j22ejm8ti9qfallzpc',
    },
  });
}

function publishMockNodes(nodes: Node[]) {
  return nodes.map((node) => publishMockNode(node));
}
