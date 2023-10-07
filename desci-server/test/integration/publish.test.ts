import 'mocha';
import fs from 'fs';

import {
  DataBucketComponent,
  ResearchObjectComponentType,
  ResearchObjectV1,
  recursiveFlattenTree,
} from '@desci-labs/desci-models';
import { User, Node } from '@prisma/client';
import { expect } from 'chai';
import supertest from 'supertest';

import { app } from '../../src';
import prisma from '../../src/client';
import { UpdateResponse } from '../../src/controllers/data';
import { NodesDraftCreateResponse, NodesDraftCreateRequest } from '../../src/controllers/nodes/draftCreate';
import { NodesDraftUpdateRequest } from '../../src/controllers/nodes/draftUpdate';
import { NodesPublishRequest } from '../../src/controllers/nodes/publish';
import { generateJwtForUser } from '../../src/services/auth';
import {
  addFilesToDag,
  spawnEmptyManifest,
  client as ipfs,
  updateManifestAndAddToIpfs,
  resolveIpfsDataAsResearchObject,
} from '../../src/services/ipfs';
import { validateDataReferences } from '../../src/utils/dataRefTools';
import { createTestNode, spawnExampleDirDag } from '../util';
describe('Publish', () => {
  let admin: User;
  let adminToken: string | undefined;
  const request = supertest(app);
  let dummyPublishRequestFilled;
  before(async () => {
    dummyPublishRequestFilled = { uuid: '1', cid: '2', manifest: await spawnEmptyManifest(), transactionId: '0x0' };
  });
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

  const PUBLISH_ROUTE = '/v1/nodes/publish';
  describe('error cases', () => {
    it('must 400 for empty request', async () => {
      const emptyRequest = {};
      const publishResp = await request
        .post(PUBLISH_ROUTE)
        .set('authorization', `Bearer ${adminToken}`)
        .send(emptyRequest);

      expect(publishResp.status).to.equal(400);
    });

    it('must 400 for empty missing cid', async () => {
      const missingCid = { ...dummyPublishRequestFilled };
      delete (missingCid as any).cid;
      const publishResp = await request
        .post(PUBLISH_ROUTE)
        .set('authorization', `Bearer ${adminToken}`)
        .send(missingCid);

      expect(publishResp.status).to.equal(400);
    });
    it('must 400 for empty missing uuid', async () => {
      const missingUuid = { ...dummyPublishRequestFilled };
      delete (missingUuid as any).uuid;

      const publishResp = await request
        .post(PUBLISH_ROUTE)
        .set('authorization', `Bearer ${adminToken}`)
        .send(missingUuid);

      expect(publishResp.status).to.equal(400);
    });
    it('must 400 for empty missing manifest', async () => {
      const missingManifest = { ...dummyPublishRequestFilled };
      delete (missingManifest as any).manifest;

      const publishResp = await request
        .post(PUBLISH_ROUTE)
        .set('authorization', `Bearer ${adminToken}`)
        .send(missingManifest);

      expect(publishResp.status).to.equal(400);
    });
    it('must 400 for empty missing transactionId', async () => {
      const missingTransactionId = { ...dummyPublishRequestFilled };
      delete (missingTransactionId as any).transactionId;

      const publishResp = await request
        .post(PUBLISH_ROUTE)
        .set('authorization', `Bearer ${adminToken}`)
        .send(missingTransactionId);

      expect(publishResp.status).to.equal(400);
    });
  });
  describe('publish scenarios', () => {
    it('succeeds with basic case', async () => {
      const draftRequest: NodesDraftCreateRequest = {
        title: 'Test Node',
        links: { pdf: [], code: [] },
      };

      const resp = await request
        .post('/v1/nodes/createDraft')
        .set('authorization', `Bearer ${adminToken}`)
        .send(draftRequest);

      const createResponse = resp.body as NodesDraftCreateResponse;

      const cid = createResponse.hash;
      const manifest = await resolveIpfsDataAsResearchObject(cid);
      const uuid = createResponse.node.uuid!;

      const nodesPublishRequest: NodesPublishRequest = {
        uuid,
        cid,
        manifest: manifest,
        transactionId: '0x0',
      };
      const publishResp = await request
        .post(PUBLISH_ROUTE)
        .set('authorization', `Bearer ${adminToken}`)
        .send(nodesPublishRequest);

      expect(publishResp.status).to.equal(200);
      const { missingRefs, unusedRefs, diffRefs } = await validateDataReferences({
        nodeUuid: uuid,
        manifestCid: cid,
        publicRefs: false,
        markExternals: false,
      });
      expect(missingRefs.length).to.eq(0);
      expect(unusedRefs.length).to.eq(0);
    });

    it('succeeds with basic data uploaded', async () => {
      const draftRequest: NodesDraftCreateRequest = {
        title: 'Test Node',
        links: { pdf: [], code: [] },
      };

      const resp = await request
        .post('/v1/nodes/createDraft')
        .set('authorization', `Bearer ${adminToken}`)
        .send(draftRequest);

      const createResponse = resp.body as NodesDraftCreateResponse;

      // upload data to node
      const baseManifest = await resolveIpfsDataAsResearchObject(createResponse.hash);
      const uuid = createResponse.node.uuid!;
      const respUpload = await request
        .post('/v1/data/update')
        .set('authorization', `Bearer ${adminToken}`)
        .field('uuid', uuid)
        .field('manifest', JSON.stringify(baseManifest))
        .field('contextPath', 'root')
        .attach('files', Buffer.from('test'), 'test.txt');

      const updateResponse = respUpload.body as UpdateResponse;

      expect(respUpload.statusCode).to.equal(200);

      const cid = updateResponse.manifestCid;
      const manifest = updateResponse.manifest;
      const nodesPublishRequest: NodesPublishRequest = {
        uuid,
        cid,
        manifest: manifest,
        transactionId: '0x0',
      };
      const publishResp = await request
        .post(PUBLISH_ROUTE)
        .set('authorization', `Bearer ${adminToken}`)
        .send(nodesPublishRequest);

      expect(publishResp.status).to.equal(200);
      const { missingRefs, unusedRefs, diffRefs } = await validateDataReferences({
        nodeUuid: uuid,
        manifestCid: cid,
        publicRefs: false,
        markExternals: false,
      });
      expect(missingRefs.length).to.eq(0);
      expect(unusedRefs.length).to.eq(0);
    });
  });
});
