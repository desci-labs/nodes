import assert from 'assert';

import { DocumentId } from '@automerge/automerge-repo';
import {
  ExternalLinkComponent,
  ResearchObjectComponentType,
  ResearchObjectV1,
  ManifestActions,
} from '@desci-labs/desci-models';
import { Node, User } from '@prisma/client';
import axios, { AxiosError, AxiosInstance } from 'axios';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { describe, it, beforeAll, expect } from 'vitest';

import { prisma } from '../../src/client.js';
import { client as ipfs, IPFS_NODE, spawnEmptyManifest } from '../../src/services/ipfs.js';
import repoService from '../../src/services/repoService.js';
import { ResearchObjectDocument } from '../../src/types/documents.js';
import { randomUUID64 } from '../../src/utils.js';
import { app } from '../testApp.js';

const createDraftNode = async (user: User, baseManifest: ResearchObjectV1, baseManifestCid: string) => {
  const node = await prisma.node.create({
    data: {
      ownerId: user.id,
      uuid: randomUUID64(),
      title: '',
      manifestUrl: baseManifestCid,
      replicationFactor: 0,
    },
  });

  const response = await repoService.initDraftDocument({
    uuid: node.uuid!,
    manifest: baseManifest,
  });

  if (response?.document && response.documentId) {
    await prisma.node.update({ where: { id: node.id }, data: { manifestDocumentId: response.documentId } });
  }
  const updatedNode = await prisma.node.findFirst({ where: { id: node.id } });

  assert(response?.documentId);
  assert(response?.document);

  return { node: updatedNode || node, documentId: response?.documentId };
};

describe('Automerge Integration', () => {
  let user: User;
  let unauthedUser: User;
  // let node: Node;
  let baseManifest: ResearchObjectV1;
  let baseManifestCid: string;

  const aliceJwtToken = jwt.sign({ email: 'alice@desci.com' }, process.env.JWT_SECRET!, { expiresIn: '1y' });
  const authHeaderVal = `Bearer ${aliceJwtToken}`;
  const bobJwtToken = jwt.sign({ email: 'bob@desci.com' }, process.env.JWT_SECRET!, { expiresIn: '1y' });
  const bobHeaderVal = `Bearer ${bobJwtToken}`;

  beforeAll(async () => {
    await prisma.$queryRaw`TRUNCATE TABLE "DataReference" CASCADE;`;
    await prisma.$queryRaw`TRUNCATE TABLE "User" CASCADE;`;
    await prisma.$queryRaw`TRUNCATE TABLE "Node" CASCADE;`;
    await prisma.$queryRaw`TRUNCATE TABLE "DocumentStore" CASCADE;`;

    const BASE_MANIFEST = await spawnEmptyManifest(IPFS_NODE.PRIVATE);
    baseManifest = BASE_MANIFEST;
    const BASE_MANIFEST_CID = (await ipfs.add(JSON.stringify(BASE_MANIFEST), { cidVersion: 1, pin: true })).cid;
    baseManifestCid = BASE_MANIFEST_CID.toString();

    user = await prisma.user.create({
      data: {
        email: 'alice@desci.com',
      },
    });
    unauthedUser = await prisma.user.create({
      data: {
        email: 'bob@desci.com',
      },
    });
  });

  describe('Dispatch Actions Api', () => {
    let node: Node;
    let dotlessUuid: string;
    const repoServiceUrl = process.env.REPO_SERVER_URL;
    const linkComponent: ExternalLinkComponent = {
      name: 'Link',
      id: randomUUID64(),
      starred: false,
      type: ResearchObjectComponentType.LINK,
      payload: { path: 'root/external links/', url: 'https://google.com' },
    };

    let res: request.Response;
    let nodeData: {
      node: Node;
      documentId: DocumentId;
    };
    let client: AxiosInstance;

    beforeAll(async () => {
      nodeData = await createDraftNode(user, baseManifest, baseManifestCid);
      node = nodeData.node;
      dotlessUuid = node.uuid!.substring(0, node.uuid!.length - 1);
      client = axios.create({
        baseURL: process.env.REPO_SERVER_URL,
        headers: { 'x-api-key': process.env.REPO_SERVICE_SECRET_KEY },
      });
    });

    it('Update Title', async () => {
      const document = (await repoService.dispatchChanges({
        uuid: node.uuid!,
        documentId: nodeData.documentId,
        actions: [{ type: 'Update Title', title: 'Test Node' }],
      })) as ResearchObjectDocument;
      expect(document.manifest.title).toBe('Test Node');
    });

    it('Update Description', async () => {
      const document = (await repoService.dispatchChanges({
        uuid: node.uuid!,
        documentId: nodeData.documentId,
        actions: [{ type: 'Update Description', description: 'A new path' }],
      })) as ResearchObjectDocument;
      expect(document.manifest.description).toBe('A new path');
    });

    it('Update License', async () => {
      const document = (await repoService.dispatchChanges({
        uuid: node.uuid!,
        documentId: nodeData.documentId,
        actions: [{ type: 'Update License', defaultLicense: 'cco' }],
      })) as ResearchObjectDocument;
      expect(document.manifest.defaultLicense).toBe('cco');
    });

    it('Update ResearchFields', async () => {
      const document = (await repoService.dispatchChanges({
        uuid: node.uuid!,
        documentId: nodeData.documentId,
        actions: [{ type: 'Update ResearchFields', researchFields: ['Science'] }],
      })) as ResearchObjectDocument;
      // console.log('RESEARCH FIELDS', document.manifest);
      expect(document.manifest.researchFields).toEqual(['Science']);
      expect(document).toHaveProperty('manifest.researchFields[0]', 'Science');
    });

    it('Add Component', async () => {
      const document = (await repoService.dispatchChanges({
        uuid: node.uuid!,
        documentId: nodeData.documentId,
        actions: [
          {
            type: 'Add Component',
            component: linkComponent,
          },
        ],
      })) as ResearchObjectDocument;
      expect(document.manifest.components.length).toBe(2);
    });

    it.skip('Reject Invalid Actions', async () => {
      try {
        // console.log('URL', repoServiceUrl, `${repoServiceUrl}/v1/nodes/documents/actions`);
        await client.post<{ ok: boolean; document: ResearchObjectDocument }>(
          `${repoServiceUrl}/v1/nodes/documents/actions`,
          {
            uuid: node.uuid!,
            documentId: nodeData.documentId,
            actions: [{ type: 'Update ResearchFieldss', researchFields: ['Science'] }],
          },
        );
        // expect(response.status).toBe(400);
      } catch (err) {
        const error = err as AxiosError;
        // console.log('[REJECT ACTIONS DATA]', error.response?.status, error.response?.data);
        expect(error).toBeInstanceOf(AxiosError);
        expect(error.response?.data).toHaveProperty('ok', false);
        expect(error.response?.status).toBe(400);
      }
    });

    it.skip('Reject Invalid Action Data', async () => {
      try {
        await client.post<{ ok: boolean; document: ResearchObjectDocument }>(
          `${repoServiceUrl}/v1/nodes/documents/actions`,
          {
            uuid: node.uuid!,
            documentId: nodeData.documentId,
            actions: [{ type: 'Update Title', researchFields: ['Science'] }],
          },
        );
      } catch (err) {
        const error = err as AxiosError;
        // console.log('[REJECT ACTIONS DATA]', error.response?.status, error.response?.data);
        expect(error).toBeInstanceOf(AxiosError);
        expect(error.response?.data).toHaveProperty('ok', false);
        expect(error.response?.status).toBe(400);
      }
    });

    it.skip('Update Title Api', async () => {
      const actions: ManifestActions[] = [{ type: 'Update Title', title: 'Api title' }];
      res = await request(app)
        .post(`/v1/nodes/documents/${dotlessUuid}/actions`)
        .set('authorization', authHeaderVal)
        .set('Content-Type', 'application/json')
        .set('Accept', 'application/json')
        .send(JSON.stringify({ uuid: node.uuid, actions }));

      // console.log('[ResponseBODY]::', res.body);
      const document = res.body.document;
      expect(document.manifest.title).toBe('Api title');
    });
  });

  // describe('Backend Repo is Initialized', () => {
  //   it('Backend Repo should be ready', () => {
  //     expect(true).toBe(true);
  //   });
  // });

  // describe('Creating a Node should create a new Automerge Document', () => {
  //   it('Backend Repo should be ready', () => {
  //     expect(true).toBe(true);
  //   });
  // });

  // describe('Existing Nodes should get an Automerge Document', () => {
  //   it('Backend Repo should be ready', () => {
  //     expect(true).toBe(true);
  //   });
  // });

  // describe('Authorisation', () => {
  //   it('Backend Repo should be ready', () => {
  //     expect(true).toBe(true);
  //   });
  // });

  // describe('Update Automerge Document', () => {
  //   it('Backend Repo should be ready', () => {
  //     expect(true).toBe(true);
  //   });
  // });
  // describe('DAG Altering Operations should be synced', () => {
  //   it('Backend Repo should be ready', () => {
  //     expect(true).toBe(true);
  //   });
  // });
});
