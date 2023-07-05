import 'mocha';
import fs from 'fs';

import { ResearchObjectV1, recursiveFlattenTree } from '@desci-labs/desci-models';
import { User, Node } from '@prisma/client';
import { expect } from 'chai';

import prisma from '../../src/client';
import * as ipfs from '../../src/services/ipfs';
import { generateExternalCidMap } from '../../src/utils/driveUtils';
import { expectThrowsAsync } from '../util';

describe('IPFS', () => {
  let admin: User;
  let node: Node;
  before(async () => {});

  after(async () => {});

  beforeEach(async () => {
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
        manifestUrl: '',
        replicationFactor: 1,
      },
    });
  });

  afterEach(async () => {});

  const EXAMPLE_MANIFEST: ResearchObjectV1 = {
    components: [],
    authors: [],
    version: 1,
  };

  describe('Service', () => {
    it('adds buffer to IPFS', async () => {
      const { cid } = await ipfs.addBufferToIpfs(Buffer.from('test'), 'DATA');
      expect(cid.toString()).to.eq('bafkreie7q3iidccmpvszul7kudcvvuavuo7u6gzlbobczuk5nqk3b4akba');
    });

    it('adds a manifest and adds a data reference', async () => {
      const res = await ipfs.updateManifestAndAddToIpfs(EXAMPLE_MANIFEST, { userId: admin.id, nodeId: node.id });
      expect(res.cid).to.eq('bafkreidf26rt63gbrwz4inlosn74hgb245tmkj7tbazrkdrchfqdfbn3u4');
      expect(res.ref).to.not.be.undefined;
      expect(res.ref.size).to.eq(42);
      // console.log('RES', res);
    });
    it('supports directories', async () => {
      const tmp = '/tmp';
      const dir = '/root/dir';
      const fullPath = tmp + dir;
      await fs.promises.mkdir(fullPath, { recursive: true });
      await fs.promises.writeFile(fullPath + '/a', 'a');
      await fs.promises.writeFile(fullPath + '/b', 'b');
      await fs.promises.writeFile(fullPath + '/c', 'c');

      const structuredFiles: ipfs.IpfsDirStructuredInput[] = [
        {
          path: 'dir/a.txt',
          content: await fs.promises.readFile(fullPath + '/a'),
        },
        {
          path: 'dir/subdir/b.txt',
          content: await fs.promises.readFile(fullPath + '/b'),
        },
        {
          path: 'dir/c.txt',
          content: await fs.promises.readFile(fullPath + '/c'),
        },
      ];

      const uploaded: ipfs.IpfsPinnedResult[] = await ipfs.pinDirectory(structuredFiles);
      expect(uploaded.length).to.be.greaterThan(0);

      const rootCid = uploaded[uploaded.length - 1].cid;

      const externalCidMap = await generateExternalCidMap(node.uuid);
      const cids = await ipfs.getDirectoryTreeCids(rootCid, externalCidMap);

      // const treeCids = await ipfs.getDirectoryTree(rootCid);
      // console.log('treeCids', JSON.stringify(treeCids));
      // expect(treeCids.length).to.eq(uploaded.length);

      // console.log('cids', cids, 'uploaded', uploaded, rootCid);
      expect(cids.length).to.eq(uploaded.length);
    });
  });

  describe('Extend DAGs', () => {
    let rootCid;
    const filesToAddToDag: ipfs.FilesToAddToDag = {};
    before(async () => {
      const structuredFiles: ipfs.IpfsDirStructuredInput[] = [
        {
          path: 'dir/a.txt',
          content: Buffer.from('A'),
        },
        {
          path: 'dir/subdir/b.txt',
          content: Buffer.from('B'),
        },
        {
          path: 'dir/c.txt',
          content: Buffer.from('C'),
        },
      ];

      const uploaded: ipfs.IpfsPinnedResult[] = await ipfs.pinDirectory(structuredFiles, true);
      rootCid = uploaded[uploaded.length - 1].cid;

      const newFiles = await ipfs.pinDirectory([{ path: 'd.txt', content: Buffer.from('D') }]);

      newFiles.forEach((file) => {
        filesToAddToDag[file.path] = { cid: file.cid, size: file.size };
      });
    });
    it('Extends a DAG at root level', async () => {
      const { updatedRootCid: newDagCid } = await ipfs.addFilesToDag(rootCid, '', filesToAddToDag);
      const externalCidMap = await generateExternalCidMap(node.uuid);
      const flatTree: any = recursiveFlattenTree(await ipfs.getDirectoryTree(newDagCid, externalCidMap));
      const newFilesFound = flatTree.some((fd) => fd.path === newDagCid + '/' + 'd.txt');
      expect(newFilesFound).to.be.true;
    });
    it('Extends a DAG at a single nesting ', async () => {
      const { updatedRootCid: newDagCid } = await ipfs.addFilesToDag(rootCid, 'dir', filesToAddToDag);
      const externalCidMap = await generateExternalCidMap(node.uuid);
      const flatTree: any = recursiveFlattenTree(await ipfs.getDirectoryTree(newDagCid, externalCidMap));
      const newFilesFound = flatTree.some((fd) => fd.path === newDagCid + '/dir/' + 'd.txt');
      expect(newFilesFound).to.be.true;
    });
    it('Extends a DAG at a deeply nested level', async () => {
      const { updatedRootCid: newDagCid } = await ipfs.addFilesToDag(rootCid, 'dir/subdir', filesToAddToDag);
      const externalCidMap = await generateExternalCidMap(node.uuid);
      const flatTree: any = recursiveFlattenTree(await ipfs.getDirectoryTree(newDagCid, externalCidMap));
      const newFilesFound = flatTree.some((fd) => fd.path === newDagCid + '/dir/subdir/' + 'd.txt');
      expect(newFilesFound).to.be.true;
    });
  });
});
