import 'mocha';
import { ResearchObjectComponentType, ResearchObjectV1 } from '@desci-labs/desci-models';
import { DataType, Node, User, Prisma } from '@prisma/client';
import { expect } from 'chai';
import jwt from 'jsonwebtoken';
import request from 'supertest';

import prisma from '../../src/client';
import { app } from '../../src/index';
import { addFilesToDag, getSizeForCid, client as ipfs, spawnEmptyManifest } from '../../src/services/ipfs';
import { randomUUID64 } from '../../src/utils';
import { validateAndHealDataRefs, validateDataReferences } from '../../src/utils/dataRefTools';
import { neutralizePath, recursiveFlattenTree } from '../../src/utils/driveUtils';
import { spawnExampleDirDag } from '../util';

describe('Data Controllers', () => {
  let user: User;
  // let node: Node;
  let baseManifest: ResearchObjectV1;
  let baseManifestCid: string;

  const jwtToken = jwt.sign({ email: 'noreply@desci.com' }, process.env.JWT_SECRET!, { expiresIn: '1y' });
  const authHeaderVal = `Bearer ${jwtToken}`;

  before(async () => {
    await prisma.$queryRaw`TRUNCATE TABLE "DataReference" CASCADE;`;
    await prisma.$queryRaw`TRUNCATE TABLE "User" CASCADE;`;
    await prisma.$queryRaw`TRUNCATE TABLE "Node" CASCADE;`;

    const BASE_MANIFEST = await spawnEmptyManifest();
    baseManifest = BASE_MANIFEST;
    const BASE_MANIFEST_CID = (await ipfs.add(JSON.stringify(BASE_MANIFEST), { cidVersion: 1, pin: true })).cid;
    baseManifestCid = BASE_MANIFEST_CID.toString();

    user = await prisma.user.create({
      data: {
        email: 'noreply@desci.com',
      },
    });
  });

  describe('Update', () => {
    describe('Update a node with a new file', () => {
      let node: Node;
      let res: request.Response;
      before(async () => {
        node = await prisma.node.create({
          data: {
            ownerId: user.id,
            uuid: randomUUID64(),
            title: '',
            manifestUrl: baseManifestCid,
            replicationFactor: 0,
          },
        });

        res = await request(app)
          .post('/v1/data/update')
          .set('authorization', authHeaderVal)
          .field('uuid', node.uuid!)
          .field('manifest', JSON.stringify(baseManifest))
          .field('contextPath', 'root')
          // .send({ uuid: node.uuid, manifest, contextPath: 'root' })
          .attach('files', Buffer.from('test'), 'test.txt');
      });

      it('should return status 200', () => {
        expect(res.statusCode).to.equal(200);
      });
      it('should return a tree', () => {
        expect(res.body).to.have.property('tree');
      });
      it('should contain newly added file', () => {
        const flatTree = recursiveFlattenTree(res.body.tree);
        const newFile = flatTree.find((f) => neutralizePath(f.path) === 'root/test.txt');
        expect(!!newFile).to.equal(true);
        expect(newFile.type).to.equal('file');
      });
      it('should return a manifest', () => {
        expect(res.body).to.have.property('manifest');
      });
      it('should return a manifestCid', () => {
        expect(res.body).to.have.property('manifestCid');
      });
      it('should have created all necessary data references', async () => {
        const { missingRefs, unusedRefs, diffRefs } = await validateDataReferences(
          node.uuid!,
          res.body.manifestCid,
          false,
        );
        const correctRefs = missingRefs.length === 0 && unusedRefs.length === 0 && Object.keys(diffRefs).length === 0;
        expect(correctRefs).to.equal(true);
      });
      it('should have an updated manifest data bucket cid', () => {
        const oldDataBucketCid = baseManifest.components[0].payload.cid;
        const newDataBucketCid = res.body.manifest.components[0].payload.cid;
        expect(oldDataBucketCid).to.not.equal(newDataBucketCid);
      });
      it('should reject an update with a file name that already exists in the same directory', async () => {
        const newRes = await request(app)
          .post('/v1/data/update')
          .set('authorization', authHeaderVal)
          .field('uuid', node.uuid!)
          .field('manifest', JSON.stringify(res.body.manifest))
          .field('contextPath', 'root')
          .attach('files', Buffer.from('test'), 'test.txt');
        expect(newRes.statusCode).to.equal(400);
      });
      it('should reject an update if more than a single upload method is used (files, new folder, externalCid, externalUrl...)', async () => {
        const newRes = await request(app)
          .post('/v1/data/update')
          .set('authorization', authHeaderVal)
          .field('uuid', node.uuid!)
          .field('manifest', JSON.stringify(res.body.manifest))
          .field('externalUrl', JSON.stringify({ url: 'https://github.com/some-repo', path: 'my repo' }))
          .field('contextPath', 'root')
          .attach('files', Buffer.from('test'), 'test.txt');
        expect(newRes.statusCode).to.equal(400);
      });
    });

    describe('Update a node with a new folder', () => {
      let node: Node;
      let res: request.Response;
      before(async () => {
        node = await prisma.node.create({
          data: {
            ownerId: user.id,
            uuid: randomUUID64(),
            title: '',
            manifestUrl: baseManifestCid,
            replicationFactor: 0,
          },
        });

        res = await request(app)
          .post('/v1/data/update')
          .set('authorization', authHeaderVal)
          .field('uuid', node.uuid!)
          .field('manifest', JSON.stringify(baseManifest))
          .field('contextPath', 'root')
          .field('newFolderName', 'My New Folder');
      });

      it('should return status 200', () => {
        expect(res.statusCode).to.equal(200);
      });
      it('should return a tree', () => {
        expect(res.body).to.have.property('tree');
      });
      it('should contain newly added folder', () => {
        const flatTree = recursiveFlattenTree(res.body.tree);
        const newFolder = flatTree.find((f) => neutralizePath(f.path) === 'root/My New Folder');
        expect(!!newFolder).to.equal(true);
        expect(newFolder.type).to.equal('dir');
      });
      it('should return a manifest', () => {
        expect(res.body).to.have.property('manifest');
      });
      it('should return a manifestCid', () => {
        expect(res.body).to.have.property('manifestCid');
      });
      it('should have created all necessary data references', async () => {
        const { missingRefs, unusedRefs, diffRefs } = await validateDataReferences(
          node.uuid!,
          res.body.manifestCid,
          false,
        );
        const correctRefs = missingRefs.length === 0 && unusedRefs.length === 0 && Object.keys(diffRefs).length === 0;
        expect(correctRefs).to.equal(true);
      });
      it('should have an updated manifest data bucket cid', () => {
        const oldDataBucketCid = baseManifest.components[0].payload.cid;
        const newDataBucketCid = res.body.manifest.components[0].payload.cid;
        expect(oldDataBucketCid).to.not.equal(newDataBucketCid);
      });
    });
    describe('Update a node with a code repo via external URL', () => {
      let node: Node;
      let res: request.Response;
      const externalRepoUrl = 'https://github.com/github/dev';
      const externalRepoPath = 'A Repo';
      before(async () => {
        node = await prisma.node.create({
          data: {
            ownerId: user.id,
            uuid: randomUUID64(),
            title: '',
            manifestUrl: baseManifestCid,
            replicationFactor: 0,
          },
        });
        res = await request(app)
          .post('/v1/data/update')
          .set('authorization', authHeaderVal)
          .field('uuid', node.uuid!)
          .field('manifest', JSON.stringify(baseManifest))
          .field('contextPath', 'root')
          .field('externalUrl', JSON.stringify({ url: externalRepoUrl, path: externalRepoPath }))
          .field('componentType', ResearchObjectComponentType.CODE);
      });

      it('should return status 200', () => {
        expect(res.statusCode).to.equal(200);
      });
      it('should return a tree', () => {
        expect(res.body).to.have.property('tree');
      });
      it('should contain newly added external repo', () => {
        const flatTree = recursiveFlattenTree(res.body.tree);
        const newFolder = flatTree.find((f) => neutralizePath(f.path) === 'root/' + externalRepoPath);
        expect(!!newFolder).to.equal(true);
        expect(newFolder.type).to.equal('dir');
      });
      it('should return a manifest', () => {
        expect(res.body).to.have.property('manifest');
      });
      it('should return a manifestCid', () => {
        expect(res.body).to.have.property('manifestCid');
      });
      it('should have created all necessary data references', async () => {
        const { missingRefs, unusedRefs, diffRefs } = await validateDataReferences(
          node.uuid!,
          res.body.manifestCid,
          false,
        );
        const correctRefs = missingRefs.length === 0 && unusedRefs.length === 0 && Object.keys(diffRefs).length === 0;
        expect(correctRefs).to.equal(true);
      });
      it('should have an updated manifest data bucket cid', () => {
        const oldDataBucketCid = baseManifest.components[0].payload.cid;
        const newDataBucketCid = res.body.manifest.components[0].payload.cid;
        expect(oldDataBucketCid).to.not.equal(newDataBucketCid);
      });
      it('should have added a code component to the manifest', () => {
        const newCodeComponent = res.body.manifest.components.find(
          (c) => c.type === ResearchObjectComponentType.CODE && c.payload.path === 'root/' + externalRepoPath,
        );
        expect(!!newCodeComponent).to.equal(true);
      });
      it('should have added the repo url to the new code components payload', () => {
        const newCodeComponent = res.body.manifest.components.find(
          (c) => c.type === ResearchObjectComponentType.CODE && c.payload.path === 'root/' + externalRepoPath,
        );

        expect(newCodeComponent.payload.externalUrl).to.equal(externalRepoUrl);
      });
    });
  });

  describe('Retrieve', () => {
    before(async () => {
      await prisma.$queryRaw`TRUNCATE TABLE "DataReference" CASCADE;`;
      await prisma.$queryRaw`TRUNCATE TABLE "Node" CASCADE;`;
    });

    describe('Retrieves a tree for a draft node without any external CIDs', () => {
      let node: Node;
      const privShareUuid = 'abcdef';
      let res: request.Response;
      let unauthedRes: request.Response;
      let privShareRes: request.Response;
      let incorrectPrivShareRes: request.Response;

      before(async () => {
        const manifest = { ...baseManifest };
        const exampleDagCid = await spawnExampleDirDag();
        manifest.components[0].payload.cid = exampleDagCid;
        const manifestCid = (await ipfs.add(JSON.stringify(manifest), { cidVersion: 1, pin: true })).cid.toString();

        node = await prisma.node.create({
          data: {
            ownerId: user.id,
            uuid: randomUUID64(),
            title: '',
            manifestUrl: manifestCid,
            replicationFactor: 0,
          },
        });
        const manifestEntry: Prisma.DataReferenceCreateManyInput = {
          cid: manifestCid,
          userId: user.id,
          root: false,
          directory: false,
          size: await getSizeForCid(manifestCid, false),
          type: DataType.MANIFEST,
          nodeId: node.id,
        };

        await prisma.dataReference.create({ data: manifestEntry });
        await prisma.privateShare.create({ data: { shareId: privShareUuid, nodeUUID: node.uuid! } });
        await validateAndHealDataRefs(node.uuid!, manifestCid, false);

        const dotlessUuid = node.uuid!.substring(0, node.uuid!.length - 1);
        res = await request(app)
          .get(`/v1/data/retrieveTree/${dotlessUuid}/${exampleDagCid}`)
          .set('authorization', authHeaderVal);
        unauthedRes = await request(app).get(`/v1/data/retrieveTree/${dotlessUuid}/${exampleDagCid}`);
        privShareRes = await request(app).get(`/v1/data/retrieveTree/${dotlessUuid}/${exampleDagCid}/${privShareUuid}`);
        incorrectPrivShareRes = await request(app).get(
          `/v1/data/retrieveTree/${dotlessUuid}/${exampleDagCid}/wrongShareId`,
        );
      });

      it('should return status 200', () => {
        expect(res.statusCode).to.equal(200);
      });
      it('should return a tree if authed', () => {
        expect(res.body).to.have.property('tree');
      });
      it('should return a tree if correct shareId', () => {
        expect(privShareRes.body).to.have.property('tree');
        expect(privShareRes.statusCode).to.equal(200);
      });
      it('should reject if unauthed', () => {
        expect(unauthedRes.statusCode).to.not.equal(200);
      });
      it('should reject if incorrect shareId', () => {
        expect(incorrectPrivShareRes.statusCode).to.not.equal(200);
      });
    });
  });

  describe('Move', () => {});
  describe('Rename', () => {});
  describe('Delete', () => {});
});
