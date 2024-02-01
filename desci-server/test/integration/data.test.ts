import 'dotenv/config';
import 'mocha';
import assert from 'assert';

import { DocumentId } from '@automerge/automerge-repo';
import {
  DriveObject,
  FileDir,
  RecursiveLsResult,
  ResearchObjectComponentType,
  ResearchObjectV1,
  ResearchObjectV1Component,
  neutralizePath,
  recursiveFlattenTree,
} from '@desci-labs/desci-models';
import { DataType, Node, User, Prisma } from '@prisma/client';
import { expect } from 'chai';
import jwt from 'jsonwebtoken';
import request from 'supertest';

import { prisma } from '../../src/client.js';
import { app } from '../../src/index.js';
import { backendRepo } from '../../src/repo.js';
import { migrateIpfsTreeToNodeTree } from '../../src/services/draftTrees.js';
import {
  addFilesToDag,
  getDirectoryTree,
  getSizeForCid,
  client as ipfs,
  spawnEmptyManifest,
} from '../../src/services/ipfs.js';
import { NodeUuid, getAutomergeUrl } from '../../src/services/manifestRepo.js';
// import { ResearchObjectDocument } from '../../src/types/documents.js';
import repoService from '../../src/services/repoService.js';
import { validateAndHealDataRefs, validateDataReferences } from '../../src/utils/dataRefTools.js';
import { draftNodeTreeEntriesToFlatIpfsTree } from '../../src/utils/draftTreeUtils.js';
import { addComponentsToDraftManifest } from '../../src/utils/driveUtils.js';
import { randomUUID64 } from '../../src/utils.js';
import { spawnExampleDirDag } from '../util.js';

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
    uuid: node.uuid as NodeUuid,
    manifest: baseManifest,
  });

  if (response?.document && response.documentId) {
    await prisma.node.update({ where: { id: node.id }, data: { manifestDocumentId: response.documentId } });
  }
  const updatedNode = await prisma.node.findFirst({ where: { id: node.id } });
  console.log('Draft Node create', response);

  assert(response?.documentId);
  assert(response?.document);

  return { node: updatedNode || node, documentId: response?.documentId };
};

describe('Data Controllers', () => {
  let user: User;
  let unauthedUser: User;
  // let node: Node;
  let baseManifest: ResearchObjectV1;
  let baseManifestCid: string;

  const aliceJwtToken = jwt.sign({ email: 'alice@desci.com' }, process.env.JWT_SECRET!, { expiresIn: '1y' });
  const authHeaderVal = `Bearer ${aliceJwtToken}`;
  const bobJwtToken = jwt.sign({ email: 'bob@desci.com' }, process.env.JWT_SECRET!, { expiresIn: '1y' });
  const bobHeaderVal = `Bearer ${bobJwtToken}`;

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
        email: 'alice@desci.com',
      },
    });
    unauthedUser = await prisma.user.create({
      data: {
        email: 'bob@desci.com',
      },
    });
  });

  describe('Update', () => {
    describe('Update a node with a new file', () => {
      let node: Node;
      let res: request.Response;

      before(async () => {
        const nodeData = await createDraftNode(user, baseManifest, baseManifestCid);
        node = nodeData.node;

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
        const flatTree = recursiveFlattenTree(res.body.tree) as DriveObject[];
        const newFile = flatTree.find((f) => neutralizePath(f.path!) === 'root/test.txt');
        expect(!!newFile).to.equal(true);
        expect(newFile?.type).to.equal('file');
      });
      it('should return a manifest', () => {
        expect(res.body).to.have.property('manifest');
      });
      it('should return a manifestCid', () => {
        expect(res.body).to.have.property('manifestCid');
      });
      it('should have created all necessary data references', async () => {
        const { missingRefs, unusedRefs, diffRefs } = await validateDataReferences({
          nodeUuid: node.uuid!,
          manifestCid: res.body.manifestCid,
          publicRefs: false,
        });
        // debugger;
        const correctRefs = missingRefs.length === 0 && unusedRefs.length === 0 && Object.keys(diffRefs).length === 0;
        expect(correctRefs).to.equal(true);
      });
      // IDEALLY REPLACED WITH A NONCE TEST
      // it('should have an updated manifest data bucket cid', () => {
      //   const oldDataBucketCid = baseManifest.components[0].payload.cid;
      //   const newDataBucketCid = res.body.manifest.components[0].payload.cid;
      //   expect(oldDataBucketCid).to.not.equal(newDataBucketCid);
      // });
      it('should reject if unauthed', async () => {
        const newRes = await request(app)
          .post('/v1/data/update')
          .field('uuid', node.uuid!)
          .field('manifest', JSON.stringify(res.body.manifest))
          .field('contextPath', 'root')
          .attach('files', Buffer.from('test'), 'test2.txt');
        expect(newRes.statusCode).to.not.equal(200);
      });
      it('should reject if wrong user tries to update', async () => {
        const newRes = await request(app)
          .post('/v1/data/update')
          .set('authorization', bobHeaderVal)
          .field('uuid', node.uuid!)
          .field('manifest', JSON.stringify(res.body.manifest))
          .field('contextPath', 'root')
          .attach('files', Buffer.from('test'), 'test2.txt');
        expect(newRes.statusCode).to.not.equal(200);
      });
      it('should reject an update with a file name that already exists in the same directory', async () => {
        const newRes = await request(app)
          .post('/v1/data/update')
          .set('authorization', authHeaderVal)
          .field('uuid', node.uuid!)
          .field('manifest', JSON.stringify(res.body.manifest))
          .field('contextPath', 'root')
          .attach('files', Buffer.from('test'), 'test.txt');
        expect(newRes.statusCode).to.equal(409);
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
        const nodeData = await createDraftNode(user, baseManifest, baseManifestCid);
        node = nodeData.node;

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
        const flatTree = recursiveFlattenTree(res.body.tree) as DriveObject[];
        const newFolder = flatTree.find((f) => neutralizePath(f.path!) === 'root/My New Folder');
        expect(!!newFolder).to.equal(true);
        expect(newFolder?.type).to.equal('dir');
      });
      it('should return a manifest', () => {
        expect(res.body).to.have.property('manifest');
      });
      it('should return a manifestCid', () => {
        expect(res.body).to.have.property('manifestCid');
      });
      it('should have created all necessary data references', async () => {
        const { missingRefs, unusedRefs, diffRefs } = await validateDataReferences({
          nodeUuid: node.uuid!,
          manifestCid: res.body.manifestCid,
          publicRefs: false,
        });
        // debugger;
        const correctRefs = missingRefs.length === 0 && unusedRefs.length === 0 && Object.keys(diffRefs).length === 0;
        expect(correctRefs).to.equal(true);
      });
      // it('should have an updated manifest data bucket cid', () => {
      //   const oldDataBucketCid = baseManifest.components[0].payload.cid;
      //   const newDataBucketCid = res.body.manifest.components[0].payload.cid;
      //   expect(oldDataBucketCid).to.not.equal(newDataBucketCid);
      // });
    });
    describe('Update a node with a code repo via external URL', () => {
      let node: Node;
      let res: request.Response;
      const externalRepoUrl = 'https://github.com/github/dev';
      const externalRepoPath = 'A Repo';
      let documentId: DocumentId;

      before(async () => {
        const nodeData = await createDraftNode(user, baseManifest, baseManifestCid);
        node = nodeData.node;
        documentId = nodeData.documentId;

        res = await request(app)
          .post('/v1/data/update')
          .set('authorization', authHeaderVal)
          .field('uuid', node.uuid!)
          .field('manifest', JSON.stringify(baseManifest))
          .field('contextPath', 'root')
          .field('externalUrl', JSON.stringify({ url: externalRepoUrl, path: externalRepoPath }))
          .field('componentType', ResearchObjectComponentType.CODE);
        console.log('[Response]::', res.body);
      });

      it('should return status 200', () => {
        expect(res.statusCode).to.equal(200);
      });
      it('should return a tree', () => {
        expect(res.body).to.have.property('tree');
      });
      it('should contain newly added external repo', () => {
        const flatTree = recursiveFlattenTree(res.body.tree) as DriveObject[];
        const newFolder = flatTree.find((f) => neutralizePath(f.path!) === 'root/' + externalRepoPath);
        expect(!!newFolder).to.equal(true);
        expect(newFolder?.type).to.equal('dir');
      });
      it('should return a manifest', () => {
        expect(res.body).to.have.property('manifest');
      });
      it('should return a manifestCid', () => {
        expect(res.body).to.have.property('manifestCid');
      });
      it('should have created all necessary data references', async () => {
        const { missingRefs, unusedRefs, diffRefs } = await validateDataReferences({
          nodeUuid: node.uuid!,
          manifestCid: res.body.manifestCid,
          publicRefs: false,
        });
        // debugger;
        const correctRefs = missingRefs.length === 0 && unusedRefs.length === 0 && Object.keys(diffRefs).length === 0;
        expect(correctRefs).to.equal(true);
      });
      // it('should have an updated manifest data bucket cid', () => {
      //   const oldDataBucketCid = baseManifest.components[0].payload.cid;
      //   const newDataBucketCid = res.body.manifest.components[0].payload.cid;
      //   expect(oldDataBucketCid).to.not.equal(newDataBucketCid);
      // });
      it('should have added a code component to the manifest', async () => {
        console.log(res.body.manifest?.components);
        // const handle = backendRepo.find(getAutomergeUrl(documentId));
        // const doc = await handle.doc();
        // console.log('Doc', doc.manifest.components);

        const newCodeComponent = res.body.manifest.components.find(
          (c) => c.type === ResearchObjectComponentType.CODE && c.payload.path === 'root/' + externalRepoPath,
        );
        expect(!!newCodeComponent).to.equal(true);
      });
      it('should have added the repo url to the new code components payload', () => {
        console.log('[log]', res.body.manifest);
        const newCodeComponent = res.body.manifest.components.find(
          (c) => c.type === ResearchObjectComponentType.CODE && c.payload.path === 'root/' + externalRepoPath,
        );
        console.log('[log]', newCodeComponent);

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

      let dotlessUuid: string;
      let manifestCid: string;
      let exampleDagCid: string;

      before(async () => {
        const manifest = { ...baseManifest };
        exampleDagCid = await spawnExampleDirDag();
        manifest.components[0].payload.cid = exampleDagCid;
        manifestCid = (await ipfs.add(JSON.stringify(manifest), { cidVersion: 1, pin: true })).cid.toString();

        const nodeData = await createDraftNode(user, manifest, manifestCid);
        node = nodeData.node;

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
        await validateAndHealDataRefs({ nodeUuid: node.uuid!, manifestCid, publicRefs: false });

        dotlessUuid = node.uuid!.substring(0, node.uuid!.length - 1);
      });

      it('should return a tree if authed', async () => {
        const res = await request(app)
          .get(`/v1/data/retrieveTree/${dotlessUuid}/${manifestCid}`)
          .set('authorization', authHeaderVal);
        expect(res.statusCode).to.equal(200);
        expect(res.body).to.have.property('tree');
      });
      it('should return a depth 1 tree if authed', async () => {
        const res = await request(app)
          .get(`/v1/data/retrieveTree/${dotlessUuid}/${manifestCid}?depth=1`)
          .set('authorization', authHeaderVal);
        expect(res.statusCode).to.equal(200);
        expect(res.body).to.have.property('tree');
      });
      it('should return a tree if correct shareId', async () => {
        const url = `/v1/data/retrieveTree/${dotlessUuid}/${manifestCid}/${privShareUuid}`;
        const privShareRes = await request(app).get(url);
        expect(privShareRes.body).to.have.property('tree');
        expect(privShareRes.statusCode).to.equal(200);
      });
      it('should reject if unauthed', async () => {
        const unauthedRes = await request(app).get(`/v1/data/retrieveTree/${dotlessUuid}/${manifestCid}`);
        expect(unauthedRes.statusCode).to.not.equal(200);
      });
      it('should reject if wrong user', async () => {
        const wrongAuthRes = await request(app)
          .get(`/v1/data/retrieveTree/${dotlessUuid}/${manifestCid}`)
          .set('authorization', bobHeaderVal);
        expect(wrongAuthRes.statusCode).to.not.equal(200);
      });
      it('should reject if incorrect shareId', async () => {
        const incorrectPrivShareRes = await request(app).get(
          `/v1/data/retrieveTree/${dotlessUuid}/${exampleDagCid}/wrongShareId`,
        );
        expect(incorrectPrivShareRes.statusCode).to.not.equal(200);
      });
    });
  });

  describe('Delete', () => {
    before(async () => {
      await prisma.$queryRaw`TRUNCATE TABLE "DataReference" CASCADE;`;
      await prisma.$queryRaw`TRUNCATE TABLE "Node" CASCADE;`;
      await prisma.$queryRaw`TRUNCATE TABLE "CidPruneList" CASCADE;`;
    });

    describe('Deletes a directory from a node', () => {
      let node: Node;
      let res: request.Response;

      const deleteDirPath = 'root/dir/subdir';

      before(async () => {
        let manifest: ResearchObjectV1 = { ...baseManifest };
        const exampleDagCid = await spawnExampleDirDag();
        manifest.components[0].payload.cid = exampleDagCid;
        const componentsToAdd = ['dir/subdir', 'dir/subdir/b.txt'].map((path) => ({
          name: 'component for ' + path,
          path: 'root/' + path,
          cid: 'anycid',
          componentType: ResearchObjectComponentType.CODE,
          star: true,
        }));

        const nodeData = await createDraftNode(user, manifest, baseManifestCid);
        node = nodeData.node;

        manifest = (await addComponentsToDraftManifest(node, componentsToAdd)) ?? manifest;
        const manifestCid = (await ipfs.add(JSON.stringify(manifest), { cidVersion: 1, pin: true })).cid.toString();
        await prisma.node.update({ where: { id: node.id }, data: { manifestUrl: manifestCid } });

        const manifestEntry: Prisma.DataReferenceCreateManyInput = {
          cid: manifestCid,
          userId: user.id,
          root: false,
          directory: false,
          size: await getSizeForCid(manifestCid, false),
          type: DataType.MANIFEST,
          nodeId: node.id,
        };

        await migrateIpfsTreeToNodeTree(node.uuid!);

        await prisma.dataReference.create({ data: manifestEntry });
        await validateAndHealDataRefs({ nodeUuid: node.uuid!, manifestCid, publicRefs: false });

        res = await request(app)
          .post(`/v1/data/delete`)
          .set('authorization', authHeaderVal)
          .send({ uuid: node.uuid!, path: deleteDirPath });
      });

      it('should return status 200', () => {
        expect(res.statusCode).to.equal(200);
      });
      it('should return new manifest', () => {
        expect(res.body).to.have.property('manifest');
      });
      it('should return new manifestCid', () => {
        expect(res.body).to.have.property('manifestCid');
      });
      // it('should have an updated manifest data bucket cid', () => {
      //   const oldDataBucketCid = baseManifest.components[0].payload.cid;
      //   const newDataBucketCid = res.body.manifest.components[0].payload.cid;
      //   expect(oldDataBucketCid).to.not.equal(newDataBucketCid);
      // });
      it('should reject if unauthed', async () => {
        const res = await request(app).post(`/v1/data/delete`).send({ uuid: node.uuid, path: 'root/dir' });
        expect(res.statusCode).to.not.equal(200);
      });
      it('should reject if wrong user', async () => {
        const res = await request(app)
          .post(`/v1/data/delete`)
          .set('authorization', bobHeaderVal)
          .send({ uuid: node.uuid, path: 'root/dir' });
        expect(res.statusCode).to.not.equal(200);
      });
      it('should remove deleted content data references', async () => {
        const { missingRefs, unusedRefs, diffRefs } = await validateDataReferences({
          nodeUuid: node.uuid!,
          manifestCid: res.body.manifestCid,
          publicRefs: false,
        });
        const correctRefs = missingRefs.length === 0 && unusedRefs.length === 0 && Object.keys(diffRefs).length === 0;
        expect(correctRefs).to.equal(true);
      });
      it('should remove deleted component from manifest', () => {
        const deletedComponentFound = res.body.manifest.components.find((c) => c.payload.path === deleteDirPath);
        expect(!!deletedComponentFound).to.not.equal(true);
      });
      it('should cascade delete all components that were contained within the deleted directory', () => {
        const containedComponentFound = res.body.manifest.components.some((c) =>
          c.payload.path.includes(deleteDirPath),
        );
        expect(!!containedComponentFound).to.not.equal(true);
      });
      it('should add deleted entries to cidPruneList', async () => {
        const deletedCids = ['bafkreig7pzyokaqvit2igs564zfj4n4j726ex2auodpwfhfnnxnqgmqklq'];
        // debugger;
        const pruneListEntries = await prisma.cidPruneList.findMany({ where: { cid: { in: deletedCids } } });
        const allEntriesFound = deletedCids.every((cid) => pruneListEntries.some((entry) => entry.cid === cid));
        expect(allEntriesFound).to.equal(true);
      });
    });
  });

  describe('Rename', () => {
    before(async () => {
      await prisma.$queryRaw`TRUNCATE TABLE "DataReference" CASCADE;`;
      await prisma.$queryRaw`TRUNCATE TABLE "Node" CASCADE;`;
      await prisma.$queryRaw`TRUNCATE TABLE "CidPruneList" CASCADE;`;
    });

    describe('Renames a directory in a node', () => {
      let node: Node;
      let res: request.Response;

      const renameDirPath = 'root/dir/subdir';
      const newPath = renameDirPath.replace('subdir', 'dubdir');

      before(async () => {
        let manifest = { ...baseManifest };
        const exampleDagCid = await spawnExampleDirDag();
        manifest.components[0].payload.cid = exampleDagCid;
        const componentsToAdd = ['dir', 'dir/subdir', 'dir/subdir/b.txt'].map((path) => ({
          name: 'component for ' + path,
          path: 'root/' + path,
          cid: 'anycid',
          componentType: ResearchObjectComponentType.CODE,
          star: true,
        }));

        const nodeData = await createDraftNode(user, baseManifest, baseManifestCid);
        node = nodeData.node;

        manifest = (await addComponentsToDraftManifest(node, componentsToAdd)) ?? manifest;
        const manifestCid = (await ipfs.add(JSON.stringify(manifest), { cidVersion: 1, pin: true })).cid.toString();
        await prisma.node.update({ where: { id: node.id }, data: { manifestUrl: manifestCid } });

        const manifestEntry: Prisma.DataReferenceCreateManyInput = {
          cid: manifestCid,
          userId: user.id,
          root: false,
          directory: false,
          size: await getSizeForCid(manifestCid, false),
          type: DataType.MANIFEST,
          nodeId: node.id,
        };

        await migrateIpfsTreeToNodeTree(node.uuid!);
        await prisma.dataReference.create({ data: manifestEntry });
        await validateAndHealDataRefs({ nodeUuid: node.uuid!, manifestCid, publicRefs: false });
        res = await request(app)
          .post(`/v1/data/rename`)
          .set('authorization', authHeaderVal)
          .send({ uuid: node.uuid!, path: renameDirPath, newName: 'dubdir', renameComponent: true });
      });

      it('should return status 200', () => {
        expect(res.statusCode).to.equal(200);
      });
      it('should return new manifest', () => {
        expect(res.body).to.have.property('manifest');
      });
      it('should return new manifestCid', () => {
        expect(res.body).to.have.property('manifestCid');
      });
      it('draft tree should contain renamed directory and nested files', async () => {
        const treeEntries = await prisma.draftNodeTree.findMany({
          where: { nodeId: node.id },
        });
        const flatTree = draftNodeTreeEntriesToFlatIpfsTree(treeEntries);
        const renamedDir = flatTree.find((f) => f.path === newPath);
        const nestedFile = flatTree.find((f) => f.path === newPath + '/b.txt');
        // debugger;
        expect(!!renamedDir).to.equal(true);
        expect(!!nestedFile).to.equal(true);
        expect(renamedDir?.type).to.equal('dir');
        expect(nestedFile?.type).to.equal('file');
      });
      // it('should have an updated manifest data bucket cid', () => {
      //   const oldDataBucketCid = baseManifest.components[0].payload.cid;
      //   const newDataBucketCid = res.body.manifest.components[0].payload.cid;
      //   expect(oldDataBucketCid).to.not.equal(newDataBucketCid);
      // });
      it('should reject if unauthed', async () => {
        const res = await request(app)
          .post(`/v1/data/rename`)
          .send({ uuid: node.uuid!, path: renameDirPath, newName: 'dubdir', renameComponent: true });
        expect(res.statusCode).to.not.equal(200);
      });
      it('should reject if wrong user', async () => {
        const res = await request(app)
          .post(`/v1/data/rename`)
          .set('authorization', bobHeaderVal)
          .send({ uuid: node.uuid!, path: renameDirPath, newName: 'dubdir', renameComponent: true });
        expect(res.statusCode).to.not.equal(200);
      });
      it('should rename all appropriate data references', async () => {
        const { missingRefs, unusedRefs, diffRefs } = await validateDataReferences({
          nodeUuid: node.uuid!,
          manifestCid: res.body.manifestCid,
          publicRefs: false,
        });
        const correctRefs = missingRefs.length === 0 && unusedRefs.length === 0 && Object.keys(diffRefs).length === 0;
        expect(correctRefs).to.equal(true);
      });
      it('should update component path in manifest', () => {
        const oldPathFound = res.body.manifest.components.find((c) => c.payload.path === renameDirPath);
        const newPath = renameDirPath.replace('subdir', 'dubdir');
        const newPathFound = res.body.manifest.components.find((c) => c.payload.path === newPath);
        expect(!!oldPathFound).to.not.equal(true);
        expect(!!newPathFound).to.equal(true);
      });
      it('should cascade update all manifest component paths that were dependent on the renamed directory', () => {
        console.log('[LOG]::', res.body.manifest);
        const oldPathContainedComponentFound = res.body.manifest.components.some((c) =>
          c.payload.path.includes(renameDirPath),
        );
        const containedNewPathFound = res.body.manifest.components.find((c) => c.payload.path === newPath + '/b.txt');
        expect(!!oldPathContainedComponentFound).to.not.equal(true);
        expect(!!containedNewPathFound).to.equal(true);
      });
      it('should rename component card if renameComponent flag is true', () => {
        console.log('[LOG]::', res.body.manifest);
        const componentCard = res.body.manifest.components.find((c) => c.payload.path === newPath);
        expect(componentCard.name).to.equal('dubdir');
      });
      it('should reject if new name already exists within the same directory', async () => {
        // debugger;
        const res = await request(app)
          .post(`/v1/data/rename`)
          .set('authorization', authHeaderVal)
          .send({ uuid: node.uuid!, path: 'root/dir/a.txt', newName: 'c.txt' });
        expect(res.statusCode).to.not.equal(200);
      });
    });
  });

  describe('Move', () => {
    before(async () => {
      await prisma.$queryRaw`TRUNCATE TABLE "DataReference" CASCADE;`;
      await prisma.$queryRaw`TRUNCATE TABLE "Node" CASCADE;`;
    });

    describe('Moves a directory in a node to another location', () => {
      let node: Node;
      let res: request.Response;

      const moveDirPath = 'root/dir/subdir';
      const moveToPath = 'root/subdir';

      before(async () => {
        let manifest = await spawnEmptyManifest();
        // debugger;
        const exampleDagCid = await spawnExampleDirDag();
        const newFileCid = (await ipfs.add(Buffer.from('a'), { cidVersion: 1, pin: true })).cid.toString();
        const { updatedRootCid } = await addFilesToDag(exampleDagCid, 'dir', {
          'd.txt': { cid: newFileCid, size: 1 },
        });
        const { updatedRootCid: newDagCid } = await addFilesToDag(updatedRootCid, 'dir/subdir', {
          'a.txt': { cid: newFileCid, size: 1 },
        });

        manifest.components[0].payload.cid = newDagCid;

        const tree = recursiveFlattenTree(await getDirectoryTree(newDagCid, {})) as RecursiveLsResult[];
        // debugger;
        const componentsToAdd = ['root/dir', 'root/dir/subdir', 'root/dir/subdir/b.txt'].map((path) => {
          const match = tree.find((fd) => neutralizePath(fd.path) === path);
          return {
            name: match!.name!,
            path: neutralizePath(match!.path!),
            cid: match!.cid!,
            componentType: ResearchObjectComponentType.CODE,
            star: true,
          };
        });

        const nodeData = await createDraftNode(user, manifest, baseManifestCid);
        node = nodeData.node;

        manifest = (await addComponentsToDraftManifest(node, componentsToAdd)) ?? manifest;
        const manifestCid = (await ipfs.add(JSON.stringify(manifest), { cidVersion: 1, pin: true })).cid.toString();

        await prisma.node.update({ where: { id: node.id }, data: { manifestUrl: manifestCid } });

        const manifestEntry: Prisma.DataReferenceCreateManyInput = {
          cid: manifestCid,
          userId: user.id,
          root: false,
          directory: false,
          size: await getSizeForCid(manifestCid, false),
          type: DataType.MANIFEST,
          nodeId: node.id,
        };

        await migrateIpfsTreeToNodeTree(node.uuid!);
        await prisma.dataReference.create({ data: manifestEntry });
        await validateAndHealDataRefs({ nodeUuid: node.uuid!, manifestCid, publicRefs: false });
        res = await request(app)
          .post(`/v1/data/move`)
          .set('authorization', authHeaderVal)
          .send({ uuid: node.uuid!, oldPath: moveDirPath, newPath: moveToPath });
      });

      it('should return status 200', () => {
        expect(res.statusCode).to.equal(200);
      });
      it('should return new manifest', () => {
        expect(res.body).to.have.property('manifest');
      });
      it('should return new manifestCid', () => {
        expect(res.body).to.have.property('manifestCid');
      });
      it('draft tree should contain moved directory', async () => {
        // const databucketCid = res.body.manifest.components[0].payload.cid;
        // const flatTree = recursiveFlattenTree(await getDirectoryTree(databucketCid, {})) as RecursiveLsResult[];
        const treeEntries = await prisma.draftNodeTree.findMany({
          where: { nodeId: node.id },
        });
        const flatTree = draftNodeTreeEntriesToFlatIpfsTree(treeEntries);
        const movedDir = flatTree.find((f) => f.path === moveToPath);
        expect(!!movedDir).to.equal(true);
        expect(movedDir?.type).to.equal('dir');
      });
      // it('should have an updated manifest data bucket cid', () => {
      //   const oldDataBucketCid = baseManifest.components[0].payload.cid;
      //   const newDataBucketCid = res.body.manifest.components[0].payload.cid;
      //   expect(oldDataBucketCid).to.not.equal(newDataBucketCid);
      // });
      it('should reject if unauthed', async () => {
        const res = await request(app)
          .post(`/v1/data/move`)
          .send({ uuid: node.uuid!, oldPath: 'root/d.txt', newPath: 'root/dir/d.txt' });
        expect(res.statusCode).to.not.equal(200);
      });
      it('should reject if wrong user', async () => {
        const res = await request(app)
          .post(`/v1/data/move`)
          .set('authorization', bobHeaderVal)
          .send({ uuid: node.uuid!, oldPath: 'root/d.txt', newPath: 'root/dir/d.txt' });
        expect(res.statusCode).to.not.equal(200);
      });
      it('should modify all appropriate data references', async () => {
        const { missingRefs, unusedRefs, diffRefs } = await validateDataReferences({
          nodeUuid: node.uuid!,
          manifestCid: res.body.manifestCid,
          publicRefs: false,
        });
        const correctRefs = missingRefs.length === 0 && unusedRefs.length === 0 && Object.keys(diffRefs).length === 0;
        expect(correctRefs).to.equal(true);
      });
      it('should update component path in manifest', () => {
        const oldPathFound = res.body.manifest.components.find((c) => c.payload.path === moveDirPath);
        const newPathFound = res.body.manifest.components.find((c) => c.payload.path === moveToPath);
        expect(!!oldPathFound).to.not.equal(true);
        expect(!!newPathFound).to.equal(true);
      });
      it('should cascade update all manifest component paths that were dependent on the moved directory', () => {
        const oldPathContainedComponentFound = res.body.manifest.components.some((c) =>
          c.payload.path.includes(moveDirPath),
        );
        const containedNewPathFound = res.body.manifest.components.find(
          (c) => c.payload.path === moveToPath + '/b.txt',
        );
        console.log('[log];:', oldPathContainedComponentFound, containedNewPathFound, res.body.manifest);
        expect(!!oldPathContainedComponentFound).to.not.equal(true);
        expect(!!containedNewPathFound).to.equal(true);
      });
      it('should reject if new path already contains file with the same name', async () => {
        const res = await request(app)
          .post(`/v1/data/move`)
          .set('authorization', authHeaderVal)
          .send({ uuid: node.uuid!, oldPath: 'root/d.txt', newPath: 'root/dir/d.txt' });
        expect(res.statusCode).to.not.equal(200);
      });
      it('manifest component payloads should only contain cids that exist within the DAG', async () => {
        const manifestComponentCids: string[] = [];
        res.body.manifest.components.forEach((c: ResearchObjectV1Component, index) => {
          if (index === 0) return;
          if (c.payload.cid) {
            manifestComponentCids.push(c.payload.cid);
          }
          if (c.payload.url) {
            manifestComponentCids.push(c.payload.url);
          }
        });
        const tree = recursiveFlattenTree(
          await getDirectoryTree(res.body.manifest.components[0].payload.cid, {}),
        ) as FileDir[];
        const allCidsExist = manifestComponentCids.every((cid) => {
          const found = tree.find((f) => f.cid === cid);
          return !!found;
        });
        expect(allCidsExist).to.equal(true);
      });
    });
  });
});
