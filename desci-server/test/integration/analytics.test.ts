import 'dotenv/config';
import 'mocha';

import { User } from '@prisma/client';
import { Sql } from '@prisma/client/runtime/library.js';
import chai, { util } from 'chai';
import chaiAsPromised from 'chai-as-promised';
import { subDays } from 'date-fn-latest';
import { sql } from 'googleapis/build/src/apis/sql/index.js';
import supertest from 'supertest';

import { prisma } from '../../src/client.js';
import { generateAccessToken } from '../../src/controllers/auth/magic.js';
import { app } from '../../src/index.js';

// use async chai assertions
chai.use(chaiAsPromised);
const expect = chai.expect;

const clearDatabase = async () => {
  await prisma.$queryRaw`TRUNCATE TABLE "User" CASCADE;`;
  await prisma.$queryRaw`TRUNCATE TABLE "Node" CASCADE;`;
};

describe('Desci Analytics', async () => {
  let mockUser: User;
  let mockToken: string;
  let request: supertest.SuperTest<supertest.Test>;

  const tearDownCommunity = async () => {
    await prisma.$queryRaw`TRUNCATE TABLE "CommunityMember" CASCADE;`;
    await prisma.$queryRaw`TRUNCATE TABLE "DesciCommunity" CASCADE;`;
  };

  beforeEach(async () => {
    await prisma.$queryRaw`TRUNCATE TABLE "User" CASCADE;`;

    mockUser = await prisma.user.create({
      data: {
        email: 'test@desci.com',
        isAdmin: true,
        createdAt: new Date('2020-04-01'),
      },
    });

    mockToken = generateAccessToken({ email: mockUser.email });

    request = supertest(app);
  });

  after(async () => {
    await clearDatabase();
    await tearDownCommunity();
  });

  describe('Counting Users', async () => {
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
      const response = await request.get('/v1/admin/analytics').set('authorization', `Bearer ${mockToken}`);
      console.log(JSON.stringify(sanitizeBigInts(response.body), null, 2));

      expect(response.status).to.equal(200);
      expect(response.body.newUsersToday).to.equal(10);
    });
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

    const response = await request
      .get(
        // april 1st 2025 to april 7th 2025
        '/v1/admin/analytics/query?from=Tue%20Apr%2001%202025%2000%3A00%3A00%20GMT%2B0800%20(Central%20Indonesia%20Time)&to=Mon%20Apr%2007%202025%2023%3A59%3A59%20GMT%2B0800%20(Central%20Indonesia%20Time)&interval=daily',
      )
      .set('authorization', `Bearer ${mockToken}`);
    console.log(JSON.stringify(sanitizeBigInts(response.body), null, 2));

    expect(response.status).to.equal(200);
    expect(response.body.data.analytics[0].newUsers).to.equal(0);
    expect(response.body.data.analytics[1].newUsers).to.equal(1);
    expect(response.body.data.analytics[2].newUsers).to.equal(2);
    expect(response.body.data.analytics[3].newUsers).to.equal(3);
    expect(response.body.data.analytics[4].newUsers).to.equal(4);
    expect(response.body.data.analytics[5].newUsers).to.equal(5);
    expect(response.body.data.analytics[6].newUsers).to.equal(6);
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
