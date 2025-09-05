import { ResearchObjectV1, isNodeRoot } from '@desci-labs/desci-models';
import { Node, User } from '@prisma/client';
import { describe, it, beforeAll, expect } from 'vitest';

import { prisma } from '../../src/client.js';
import {
  ensureSpaceAvailable,
  ensureUniquePaths,
  extractRootDagCidFromManifest,
  filterFirstNestings,
  getManifestFromNode,
  pathContainsExternalCids,
  updateManifestDataBucket,
} from '../../src/services/data/processing.js';
import { client as ipfs, IPFS_NODE, spawnEmptyManifest } from '../../src/services/ipfs.js';
import { randomUUID64 } from '../../src/utils.js';

describe('Data Processing Functions Tests', () => {
  let user: User;
  let unauthedUser: User;
  //   let node: Node;
  let baseManifest: ResearchObjectV1;
  let baseManifestCid: string;

  beforeAll(async () => {
    await prisma.$queryRaw`TRUNCATE TABLE "DataReference" CASCADE;`;
    await prisma.$queryRaw`TRUNCATE TABLE "User" CASCADE;`;
    await prisma.$queryRaw`TRUNCATE TABLE "Node" CASCADE;`;

    const BASE_MANIFEST = await spawnEmptyManifest(IPFS_NODE.PRIVATE);
    baseManifest = BASE_MANIFEST;
    const BASE_MANIFEST_CID = (await ipfs.add(JSON.stringify(BASE_MANIFEST), { cidVersion: 1, pin: true })).cid;
    baseManifestCid = BASE_MANIFEST_CID.toString();

    user = await prisma.user.create({
      data: {
        email: 'alice@desci.com',
        currentDriveStorageLimitGb: 1,
      },
    });
    unauthedUser = await prisma.user.create({
      data: {
        email: 'bob@desci.com',
        currentDriveStorageLimitGb: 1,
      },
    });
  });

  describe('ensureSpaceAvailable', () => {
    it('should return true if user has enough space, and not throw an error', async () => {
      const files = [{ size: 100 }, { size: 200 }]; // Mock files within limit
      expect(await ensureSpaceAvailable(files, user)).toBe(true);
    });

    it('should throw NotEnoughSpaceError if user does not have enough space', async () => {
      try {
        const files = [{ size: 1000000000 }, { size: 2000000000 }]; // Mock files that exceed the limit
        await ensureSpaceAvailable(files, user);
        expect.fail('Expected method to throw NotEnoughSpaceError');
      } catch (e) {
        expect(e.type).toBe('NotEnoughSpaceError');
      }
    });
  });

  describe('extractRootDagCidFromManifest', () => {
    it('should extract the correct root CID from the manifest', async () => {
      const expectedRootCid = baseManifest.components.find((c) => c.id === 'root')?.payload?.cid;
      const resultRootCid = extractRootDagCidFromManifest(baseManifest, baseManifestCid);

      expect(resultRootCid).toBe(expectedRootCid);
    });

    it('should throw InvalidManifestError if the root CID is not in the manifest', () => {
      // data-bucket-less manifest
      const malformedManifest = {
        ...baseManifest,
        components: baseManifest.components.filter((c) => c.id !== 'root'),
      };

      expect(() => extractRootDagCidFromManifest(malformedManifest, baseManifestCid))
        .toThrow()
        .with.property('type', 'InvalidManifestError');
    });
  });

  describe('getManifestFromNode', () => {
    let node: Node;

    beforeAll(async () => {
      // Create a node instance for testing
      node = await prisma.node.create({
        data: {
          ownerId: user.id,
          uuid: randomUUID64(),
          title: '',
          manifestUrl: baseManifestCid,
          replicationFactor: 0,
        },
      });
    });

    it('should fetch manifest for a given node', async () => {
      const { manifest, manifestCid } = await getManifestFromNode(node);

      expect(manifest).toEqual(baseManifest);
      expect(manifestCid).toBe(node.manifestUrl);
    });

    it('should throw IpfsUnresolvableError if the manifest cannot be fetched', async () => {
      await prisma.node.update({
        where: { id: node.id },
        data: { manifestUrl: 'invalid-cid' },
      });
      const updatedNode = await prisma.node.findFirst({ where: { id: node.id } });

      try {
        await getManifestFromNode(updatedNode!);
        expect.fail('Expected method to throw IpfsUnresolvableError');
      } catch (e) {
        expect(e).toHaveProperty('type', 'IpfsUnresolvableError');
      }
    });
  });

  describe('pathContainsExternalCids', () => {
    const flatTreeMap: any = {
      root: { name: 'root', type: 'dir', external: false },
      'root/exploring': { name: 'exploring', type: 'dir', external: false },
      'root/file.txt': { name: 'file.txt', type: 'file', external: false },
      'root/external': { name: 'external', type: 'dir', external: true },
      'root/external/file.txt': { name: 'file.txt', type: 'file', external: true },
    };

    it('should return false if path does not contain external CIDs', () => {
      const contextPath = 'root';
      const result = pathContainsExternalCids(flatTreeMap, contextPath);
      expect(result).toBe(false);
    });

    it('should throw MixingExternalDataError if path contains external CIDs', () => {
      const contextPath = 'root/external';
      expect(() => pathContainsExternalCids(flatTreeMap, contextPath))
        .toThrow()
        .with.property('type', 'MixingExternalDataError');
    });
  });

  describe('ensureUniquePaths', () => {
    const flatTreeMap: any = {
      'root/path/file1.txt': {
        path: 'root/path/file1.txt',
      },
      'root/path/file2.txt': {
        path: 'root/path/file2.txt',
      },
    };

    it('should return true if all new paths are unique', () => {
      const filesBeingAdded = [{ originalname: 'file3.txt' }, { originalname: 'file4.txt' }];
      const externalUrlFilePaths = ['file5.txt', 'file6.txt'];
      const contextPath = 'root/path';

      expect(() =>
        ensureUniquePaths({
          flatTreeMap,
          contextPath,
          filesBeingAdded,
        }),
      ).to.not.throw();
      expect(
        ensureUniquePaths({
          flatTreeMap,
          contextPath,
          filesBeingAdded,
        }),
      ).toBe(true);
    });

    it('should throw DuplicateFileError if there are duplicate paths', () => {
      const filesBeingAdded = [
        { originalname: 'file1.txt' }, // duplicate
        { originalname: 'file4.txt' },
      ];
      const contextPath = 'root/path';

      expect(() =>
        ensureUniquePaths({
          flatTreeMap,
          contextPath,
          filesBeingAdded,
        }),
      )
        .toThrow()
        .with.property('type', 'DuplicateFileError');
    });

    it('should throw DuplicateFileError if there are duplicate externalUrlFilePaths', () => {
      const externalUrlFilePaths = ['file1.txt']; // duplicate
      const contextPath = 'root/path';

      expect(() =>
        ensureUniquePaths({
          flatTreeMap,
          contextPath,
          externalUrlFilePaths,
        }),
      )
        .toThrow()
        .with.property('type', 'DuplicateFileError');
    });
  });

  describe('filterFirstNestings', () => {
    it('should filter out only the first nesting files', () => {
      const pinResults = [
        { path: 'readme.md', cid: 'cid1', size: 100 },
        { path: 'data', cid: 'cid2', size: 200 },
        { path: 'data/file1.txt', cid: 'cid3', size: 300 },
        { path: 'file2.txt', cid: 'cid4', size: 400 },
      ];

      const { filesToAddToDag, filteredFiles } = filterFirstNestings(pinResults);

      // Ensure that only first-nesting files are in the filesToAddToDag
      expect(filesToAddToDag).toEqual({
        'readme.md': { cid: 'cid1', size: 100 },
        'file2.txt': { cid: 'cid4', size: 400 },
        data: { cid: 'cid2', size: 200 },
      });

      // Ensure that the filteredFiles array only contains first-nesting files
      expect(filteredFiles).to.have.deep.members([
        { path: 'readme.md', cid: 'cid1', size: 100 },
        { path: 'file2.txt', cid: 'cid4', size: 400 },
        { path: 'data', cid: 'cid2', size: 200 },
      ]);
    });
  });

  describe('updateManifestDataBucket', () => {
    it('should update the root component CID in the manifest', () => {
      const clonedManifest = JSON.parse(JSON.stringify(baseManifest));
      const newRootCid = 'newRootCid';

      const updatedManifest = updateManifestDataBucket({
        manifest: clonedManifest,
        newRootCid,
      });

      const updatedRoot = updatedManifest.components.find((c) => isNodeRoot(c))!;

      expect(updatedRoot.payload.cid).toBe(newRootCid);
    });
  });
});
