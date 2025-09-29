import fs from 'fs';

import { ResearchObjectV1, recursiveFlattenTree } from '@desci-labs/desci-models';
import { User, Node } from '@prisma/client';
import { describe, it, beforeAll, afterAll, beforeEach, expect, afterEach } from 'vitest';

import { prisma } from '../../src/client.js';
import * as ipfs from '../../src/services/ipfs.js';
import { generateExternalCidMap } from '../../src/utils/driveUtils.js';
import { randomUUID64 } from '../../src/utils.js';

describe('IPFS', () => {
  let admin: User;
  let node: Node;
  beforeAll(async () => {});

  afterAll(async () => {});

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
        uuid: randomUUID64(),
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
      expect(cid.toString()).toBe('bafkreie7q3iidccmpvszul7kudcvvuavuo7u6gzlbobczuk5nqk3b4akba');
    });

    it('adds a manifest and adds a data reference', async () => {
      const res = await ipfs.updateManifestAndAddToIpfs(EXAMPLE_MANIFEST, { user: admin, nodeId: node.id });
      expect(res.cid).toBe('bafkreidf26rt63gbrwz4inlosn74hgb245tmkj7tbazrkdrchfqdfbn3u4');
      expect(res.ref).toBeDefined();
      expect(res.ref.size).toBe(42);
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
      expect(uploaded.length).toBeGreaterThan(0);

      const rootCid = uploaded[uploaded.length - 1].cid;

      const externalCidMap = await generateExternalCidMap(node.uuid);
      const cids = await ipfs.getDirectoryTreeCids(rootCid, externalCidMap);

      // const treeCids = await ipfs.getDirectoryTree(rootCid);
      // console.log('treeCids', JSON.stringify(treeCids));
      // expect(treeCids.length).toBe(uploaded.length);

      // console.log('cids', cids, 'uploaded', uploaded, rootCid);
      expect(cids.length).toBe(uploaded.length);
    });
  });
});
