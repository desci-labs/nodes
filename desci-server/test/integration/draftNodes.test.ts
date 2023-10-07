import 'mocha';
import fs from 'fs';

import { RESEARCH_OBJECT_NODES_PREFIX, ResearchObjectV1, recursiveFlattenTree } from '@desci-labs/desci-models';
import { User, Node } from '@prisma/client';
import { expect } from 'chai';
import supertest from 'supertest';

import { app } from '../../src';
import prisma from '../../src/client';
import type { NodesDraftCreateRequest, NodesDraftCreateResponse } from '../../src/controllers/nodes/draftCreate';
import type { NodesDraftUpdateRequest } from '../../src/controllers/nodes/draftUpdate';
import type { NodeWithPublishInfo, NodesListResponse } from '../../src/controllers/nodes/list';
import { generateJwtForUser } from '../../src/services/auth';
import { resolveIpfsData, resolveIpfsDataAsResearchObject, updateManifestAndAddToIpfs } from '../../src/services/ipfs';
import { randomUUID64 } from '../../src/utils';

describe('Draft Node', () => {
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

  describe('listing nodes', () => {
    it('resolves endpoint when list is empty', async () => {
      const result = await request.get('/v1/nodes').set('authorization', `Bearer ${adminToken}`);

      expect(result.statusCode).to.equal(200);
      expect(result.body).to.have.property('nodes');

      const { nodes } = result.body as NodesListResponse;

      expect(nodes.length).to.equal(0);
    });

    it('returns a node when one exists', async () => {
      const node = await prisma.node.create({
        data: {
          title: 'Test Node',
          uuid: randomUUID64(),
          manifestUrl: '',
          replicationFactor: 0,
          restBody: '',
          ownerId: admin.id,
        },
      });

      const result = await request.get('/v1/nodes').set('authorization', `Bearer ${adminToken}`);

      expect(result.statusCode).to.equal(200);
      expect(result.body).to.have.property('nodes');

      const { nodes } = result.body as NodesListResponse;

      expect(nodes.length).to.equal(1);
      expect(nodes[0].uuid).to.equal(node.uuid?.slice(0, -1));
    });
  });

  describe('updating a draft node', () => {
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

      const manifestId = createResponse.hash;

      const manifest = await resolveIpfsDataAsResearchObject(manifestId);

      manifest.title = 'Test Node 2';

      const retrievedNode = await prisma.node.findFirst({ where: { uuid: createResponse.node.uuid + '.' } });
      expect(retrievedNode).to.not.be.null;

      const {} = await updateManifestAndAddToIpfs(manifest, { userId: admin.id, nodeId: retrievedNode!.id });

      const draftUpdateRequest: NodesDraftUpdateRequest = {
        uuid: createResponse.node.uuid!,
        manifest: manifest,
      };

      const resp2 = await request
        .post('/v1/nodes/updateDraft')
        .set('authorization', `Bearer ${adminToken}`)
        .send(draftUpdateRequest);

      expect(resp2.statusCode).to.equal(200);
      const node = await prisma.node.findFirst({ where: { uuid: createResponse.node.uuid + '.' } });
      expect(node).to.not.be.null;
      expect(node!.title).to.equal('Test Node 2');

      //TODO: pull manifest and check metadata
    });
  });

  it('provides API with information on a single node', async () => {
    const draftRequest: NodesDraftCreateRequest = {
      title: 'Test Node',
      links: { pdf: [], code: [] },
    };

    const resp1 = await request
      .post('/v1/nodes/createDraft')
      .set('authorization', `Bearer ${adminToken}`)
      .send(draftRequest);
    const createResponse = resp1.body as NodesDraftCreateResponse;
    console.log('create response', createResponse);
    const uuid = createResponse.node.uuid;
    const nodeShowResp = await request
      .get(`/v1/nodes/${RESEARCH_OBJECT_NODES_PREFIX}${uuid}`)
      .set('authorization', `Bearer ${adminToken}`)
      .send();

    const singleNode = nodeShowResp.body as NodeWithPublishInfo;
    expect(nodeShowResp.statusCode).to.equal(200);
    expect(singleNode).to.have.property('uuid');
    expect(singleNode.uuid).to.eq(uuid + '.'); //TODO: fix this controller to not return the dotted uuid or move to base58
  });

  it('errors if invalid id given to node show API', async () => {
    const nodeShowResp = await request.get(`/v1/nodes/garbage`).set('authorization', `Bearer ${adminToken}`).send();

    const singleNode = nodeShowResp.body as NodeWithPublishInfo;
    expect(nodeShowResp.statusCode).to.equal(404);
    expect(nodeShowResp.body.ok).to.equal(false);
    expect(nodeShowResp.body.message).to.equal('cid not found');
  });

  describe('creating a new draft node', () => {
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

      expect(manifest.title).to.equal('Test Node');
      expect(manifest.components.length).to.equal(1);
      expect((manifest.authors || []).length).to.equal(0);

      expect(manifest.version).to.equal('desci-nodes-0.2.0');

      expect(resp.statusCode).to.equal(200);
    });

    /**
     * Skipping because this story is not in our workflow for frontend
     */
    it.skip('succeeds with github repo on create step', async () => {
      console.log('start basic case');
      const draftRequest: NodesDraftCreateRequest = {
        title: 'Test Node',
        links: { pdf: [], code: ['https://github.com/hubsmoke/something-world'] },
      };
      const resp = await request
        .post('/v1/nodes/createDraft')
        .set('authorization', `Bearer ${adminToken}`)
        .send(draftRequest);

      expect(resp.statusCode).to.equal(200);
    });

    it('results in being added to the list of draft nodes', async () => {
      const draftRequest: NodesDraftCreateRequest = {
        title: 'Test Node',
        links: { pdf: [], code: [] },
      };
      const resp = await request
        .post('/v1/nodes/createDraft')
        .set('authorization', `Bearer ${adminToken}`)
        .send(draftRequest);

      expect(resp.statusCode).to.equal(200);

      const result = await request.get('/v1/nodes').set('authorization', `Bearer ${adminToken}`);

      expect(result.statusCode).to.equal(200);
      expect(result.body).to.have.property('nodes');

      const { nodes } = result.body as NodesListResponse;

      expect(nodes.length).to.equal(1);
      expect(nodes[0].title).to.equal('Test Node');
      expect(nodes[0].ownerId).to.equal(admin.id);
    });
  });
});
