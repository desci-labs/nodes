import chai, { assert } from 'chai';
import chaiAsPromised from 'chai-as-promised';
import 'dotenv/config';
import 'mocha';

import { prisma } from '../../src/client.js';

// use async chai assertions
chai.use(chaiAsPromised);
const expect = chai.expect;

const clearDatabase = async () => {
  await prisma.$queryRaw`TRUNCATE TABLE "User" CASCADE;`;
  await prisma.$queryRaw`TRUNCATE TABLE "Node" CASCADE;`;
};

describe('Desci Analytics', () => {
  const tearDownCommunity = async () => {
    await prisma.$queryRaw`TRUNCATE TABLE "CommunityMember" CASCADE;`;
    await prisma.$queryRaw`TRUNCATE TABLE "DesciCommunity" CASCADE;`;
  };

  before(async () => {
    await prisma.$queryRaw`TRUNCATE TABLE "User" CASCADE;`;
  });

  after(async () => {
    await clearDatabase();
    await tearDownCommunity();
  });

  describe('Counting Users', async () => {
    it('should count users accurately', async () => {
        
    });
  });
});
