import 'mocha';
import { ResearchObjectV1 } from '@desci-labs/desci-models';
import { Node, User } from '@prisma/client';
import { AxiosRequestConfig } from 'axios';
import { expect } from 'chai';
import jwt from 'jsonwebtoken';
import request from 'supertest';

import prisma from '../../src/client';
import { app } from '../../src/index';
import { client as ipfs, spawnEmptyManifest } from '../../src/services/ipfs';
import { randomUUID64 } from '../../src/utils';

describe('Data Controllers', () => {
  let user: User;
  let node: Node;
  let manifest: ResearchObjectV1;

  const jwtToken = jwt.sign({ email: 'noreply@desci.com' }, process.env.JWT_SECRET!, { expiresIn: '1y' });
  const authHeaderVal = `Bearer ${jwtToken}`;

  before(async () => {
    await prisma.$queryRaw`TRUNCATE TABLE "DataReference" CASCADE;`;
    await prisma.$queryRaw`TRUNCATE TABLE "User" CASCADE;`;
    await prisma.$queryRaw`TRUNCATE TABLE "Node" CASCADE;`;

    const BASE_MANIFEST = await spawnEmptyManifest();
    manifest = BASE_MANIFEST;
    const BASE_MANIFEST_CID = await ipfs.add(JSON.stringify(BASE_MANIFEST), { cidVersion: 1, pin: true });

    user = await prisma.user.create({
      data: {
        email: 'noreply@desci.com',
      },
    });

    node = await prisma.node.create({
      data: {
        ownerId: user.id,
        uuid: randomUUID64(),
        title: '',
        manifestUrl: BASE_MANIFEST_CID.toString(),
        replicationFactor: 0,
      },
    });
  });

  describe('Update', () => {
    it('should update data', (done) => {
      request(app)
        .post('/v1/data/update')
        .set('authorization', authHeaderVal)
        .field('uuid', node.uuid!)
        .field('manifest', JSON.stringify(manifest))
        .field('contextPath', 'root')
        // .send({ uuid: node.uuid, manifest, contextPath: 'root' })
        .attach('files', Buffer.from('test'), 'test.txt')
        .end((err, res) => {
          expect(res.statusCode).to.equal(200);
          expect(res.body).to.have.property('tree');
          done(err);
        });
    });
  });
  describe('Move', () => {});
  describe('Retrieve', () => {});
  describe('Rename', () => {});
  describe('Delete', () => {});
});
