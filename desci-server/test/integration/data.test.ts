import 'mocha';
import { Node, User } from '@prisma/client';
import { AxiosRequestConfig } from 'axios';
import { expect } from 'chai';
import jwt from 'jsonwebtoken';
import request from 'supertest';

import prisma from '../../src/client';
import { app } from '../../src/index';
import { client as ipfs, spawnEmptyManifest } from '../../src/services/ipfs';

//describe data
// describe - each controller (update, move, rename, delete, retrieve)

describe('Data Controllers', async () => {
  let admin: User;
  let node: Node;

  const jwtToken = jwt.sign('noreply@desci.com', process.env.JWT_SECRET!, { expiresIn: '1y' });
  const authHeaderVal = `Bearer ${jwtToken}`;

  const BASE_MANIFEST = spawnEmptyManifest();
  const BASE_MANIFEST_CID = await ipfs.add(JSON.stringify(BASE_MANIFEST), { cidVersion: 1, pin: true });

  before(async () => {
    await prisma.$queryRaw`TRUNCATE TABLE "DataReference" CASCADE;`;
    await prisma.$queryRaw`TRUNCATE TABLE "User" CASCADE;`;
    await prisma.$queryRaw`TRUNCATE TABLE "Node" CASCADE;`;

    admin = await prisma.user.create({
      data: {
        email: 'noreply@desci.com',
        isAdmin: true,
      },
    });

    node = await prisma.node.create({
      data: {
        owner: { connect: { id: admin.id } },
        title: '',
        manifestUrl: BASE_MANIFEST_CID.toString(),
        replicationFactor: 0,
      },
    });
  });

  describe('Update', async () => {
    it('should update data', () => {
      request(app)
        .post('/v1/data/update')
        .set('authorization', authHeaderVal)
        .send({ uuid: '123' })
        .end((err, res) => {
          expect(res.statusCode).to.equal(200);
          expect(res.body).to.have.property('tree');
          done(err);
        });
    });
  });
  describe('Move', () => {
    // it('should move data', () => {
    //   expect(true).to.equal(true);
    // });
  });
  describe('Retrieve', () => {
    // it('should retrieve data', () => {
    //   expect(true).to.equal(true);
    // });
  });
  describe('Rename', () => {
    // it('should rename data', () => {
    //   expect(true).to.equal(true);
    // });
  });
  describe('Delete', () => {
    // it('should delete data', () => {
    //   expect(true).to.equal(true);
    // });
  });
});
