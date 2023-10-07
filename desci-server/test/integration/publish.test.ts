import 'mocha';
import fs from 'fs';

import { ResearchObjectV1, recursiveFlattenTree } from '@desci-labs/desci-models';
import { User, Node } from '@prisma/client';
import { expect } from 'chai';
import supertest from 'supertest';

import { app } from '../../src';
import prisma from '../../src/client';
import { generateJwtForUser } from '../../src/services/auth';
import * as ipfs from '../../src/services/ipfs';

describe('Publish', () => {
  let admin: User;
  let adminToken: string | undefined;
  const request = supertest(app);

  beforeEach(async () => {
    await prisma.$queryRaw`TRUNCATE TABLE "PublicDataReference" CASCADE;`;
    await prisma.$queryRaw`TRUNCATE TABLE "DataReference" CASCADE;`;
    await prisma.$queryRaw`TRUNCATE TABLE "User" CASCADE;`;
    await prisma.$queryRaw`TRUNCATE TABLE "Node" CASCADE;`;

    admin = await prisma.user.create({
      data: {
        email: 'noreply@desci.com',
        isAdmin: true,
      },
    });

    adminToken = generateJwtForUser(admin);
  });

  afterEach(async () => {});

  const EXAMPLE_MANIFEST: ResearchObjectV1 = {
    components: [],
    authors: [],
    version: 1,
  };

  describe('publishing a new node', () => {
    it('succeeds with basic case', async () => {
      // await request.post('/api/v1/nodes/createDraft').set('authorization', `Bearer ${adminToken}`).send({
      //   name: 'Test Node',
      //   description: 'Test Description',
      // });
    });

    it('succeeds with data uploaded', async () => {});

    it('succeeds with github repo uploaded', async () => {});
  });
});
