import 'dotenv/config';
import 'mocha';

import { Node, NodeLike, NodeVersion, User } from '@prisma/client';
import chai, { assert } from 'chai';
import chaiAsPromised from 'chai-as-promised';
import jwt from 'jsonwebtoken';
import request from 'supertest';

import { prisma } from '../../src/client.js';
import { app } from '../../src/index.js';
import { spawnEmptyManifest, client as ipfs } from '../../src/services/ipfs.js';
import { randomUUID64 } from '../../src/utils.js';
import { createDraftNode, createUsers } from '../util.js';

// use async chai assertions
chai.use(chaiAsPromised);
const expect = chai.expect;

const clearDatabase = async () => {
  await prisma.$queryRaw`TRUNCATE TABLE "DataReference" CASCADE;`;
  await prisma.$queryRaw`TRUNCATE TABLE "User" CASCADE;`;
  await prisma.$queryRaw`TRUNCATE TABLE "Node" CASCADE;`;
};

describe('Nodes Service', async () => {
  let users: User[];
  let nodes: Node[];
  let nodeVersions: NodeVersion[];

  //   let baseManifest: ResearchObjectV1;
  let baseManifestCid: string;

  const setup = async () => {
    users = await createUsers(10);

    const baseManifest = await spawnEmptyManifest();
    // baseManifest = BASE_MANIFEST;
    const BASE_MANIFEST_CID = (await ipfs.add(JSON.stringify(baseManifest), { cidVersion: 1, pin: true })).cid;
    baseManifestCid = BASE_MANIFEST_CID.toString();

    nodes = await Promise.all(
      users.map((user, idx) =>
        createDraftNode({
          ownerId: user.id,
          title: `Node${idx} Title`,
          cid: baseManifestCid,
          uuid: randomUUID64(),
          manifestUrl: baseManifestCid,
          replicationFactor: 0,
        }),
      ),
    );

    nodeVersions = await Promise.all(
      nodes.map((node) =>
        prisma.nodeVersion.create({
          data: { nodeId: node.id, manifestUrl: node.manifestUrl, transactionId: randomUUID64() },
        }),
      ),
    );
  };

  const tearDown = async () => {
    await prisma.$queryRaw`TRUNCATE TABLE "CommunityMember" CASCADE;`;
    await prisma.$queryRaw`TRUNCATE TABLE "DesciCommunity" CASCADE;`;
    await prisma.$queryRaw`TRUNCATE TABLE "Attestation" CASCADE;`;
    await prisma.$queryRaw`TRUNCATE TABLE "AttestationVersion" CASCADE;`;
    await prisma.$queryRaw`TRUNCATE TABLE "CommunityEntryAttestation" CASCADE;`;
    await prisma.$queryRaw`TRUNCATE TABLE "NodeAttestation" CASCADE;`;
    await prisma.$queryRaw`TRUNCATE TABLE "Annotation" CASCADE;`;
    await prisma.$queryRaw`TRUNCATE TABLE "NodeAttestationReaction" CASCADE;`;
    await prisma.$queryRaw`TRUNCATE TABLE "NodeAttestationVerification" CASCADE;`;
  };

  before(async () => {
    await clearDatabase();
    await tearDown();

    await setup();
  });

  after(async () => {
    await clearDatabase();
    await tearDown();
  });

  describe('Likes (Appreciate node)', async () => {
    let node: Node;
    let node1: Node;
    let liker: User;
    let liker1: User;
    let liker2: User;

    let vote: NodeLike;

    before(async () => {
      node = nodes[0];
      node1 = nodes[0];
      liker = users[2];
      liker1 = users[3];
      liker2 = users[4];
      assert(node.uuid);
    });

    after(async () => {
      await prisma.$queryRaw`TRUNCATE TABLE "NodeAttestation" CASCADE;`;
      await prisma.$queryRaw`TRUNCATE TABLE "Annotation" CASCADE;`;
      await prisma.$queryRaw`TRUNCATE TABLE "NodeLike" CASCADE;`;
    });

    it('should test user like via api', async () => {
      const likerJwtToken = jwt.sign({ email: liker.email }, process.env.JWT_SECRET!, {
        expiresIn: '1y',
      });
      const likerJwtHeader = `Bearer ${likerJwtToken}`;

      // send upvote request
      let res = await request(app).post(`/v1/nodes/${node.uuid}/likes`).set('authorization', likerJwtHeader).send();
      expect(res.statusCode).to.equal(200);

      // check upvote
      res = await request(app).get(`/v1/nodes/${node.uuid}/likes`).set('authorization', likerJwtHeader).send();
      expect(res.statusCode).to.equal(200);
      let data = (await res.body.data) as { likes: number; isLiked: boolean };
      expect(data.likes).to.be.equal(1);
      expect(data.isLiked).to.be.equal(true);

      // Liker 2
      const liker1JwtToken = jwt.sign({ email: liker1.email }, process.env.JWT_SECRET!, {
        expiresIn: '1y',
      });
      const liker1JwtHeader = `Bearer ${liker1JwtToken}`;

      // send upvote request
      res = await request(app).post(`/v1/nodes/${node.uuid}/likes`).set('authorization', liker1JwtHeader).send();
      expect(res.statusCode).to.equal(200);

      // check upvote
      res = await request(app).get(`/v1/nodes/${node.uuid}/likes`).set('authorization', liker1JwtHeader).send();
      expect(res.statusCode).to.equal(200);
      data = (await res.body.data) as { likes: number; isLiked: boolean };
      expect(data.likes).to.be.equal(2);
      expect(data.isLiked).to.be.equal(true);
    });

    it('should delete user vote via api', async () => {
      const likerJwtToken = jwt.sign({ email: liker.email }, process.env.JWT_SECRET!, {
        expiresIn: '1y',
      });
      const likerJwtHeader = `Bearer ${likerJwtToken}`;

      // send delete vote request
      let res = await request(app).delete(`/v1/nodes/${node.uuid}/likes`).set('authorization', likerJwtHeader).send();
      expect(res.statusCode).to.equal(200);

      // check upvote
      // check upvote
      res = await request(app).get(`/v1/nodes/${node.uuid}/likes`).set('authorization', likerJwtHeader).send();
      expect(res.statusCode).to.equal(200);
      let data = (await res.body.data) as { likes: number; isLiked: boolean };
      expect(data.likes).to.be.equal(1);
      expect(data.isLiked).to.be.equal(false);

      // Liker 2
      const liker1JwtToken = jwt.sign({ email: liker1.email }, process.env.JWT_SECRET!, {
        expiresIn: '1y',
      });
      const liker1JwtHeader = `Bearer ${liker1JwtToken}`;

      // send delete vote request
      res = await request(app).delete(`/v1/nodes/${node.uuid}/likes`).set('authorization', liker1JwtHeader).send();
      expect(res.statusCode).to.equal(200);

      // check upvote
      // check upvote
      res = await request(app).get(`/v1/nodes/${node.uuid}/likes`).set('authorization', liker1JwtHeader).send();
      expect(res.statusCode).to.equal(200);
      data = (await res.body.data) as { likes: number; isLiked: boolean };
      expect(data.likes).to.be.equal(0);
      expect(data.isLiked).to.be.equal(false);
    });
  });
});
