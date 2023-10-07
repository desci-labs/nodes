import { ResearchObjectV1 } from '@desci-labs/desci-models';
import { User } from '@prisma/client';
import { expect } from 'chai';

import prisma from '../src/client';
import {
  IpfsDirStructuredInput,
  IpfsPinnedResult,
  client as ipfs,
  pinDirectory,
  updateManifestAndAddToIpfs,
} from '../src/services/ipfs';
import { randomUUID64 } from '../src/utils';

const expectThrowsAsync = async (method, errorMessage) => {
  let error = null;
  try {
    await method();
  } catch (err) {
    error = err;
    // console.error("expectThrowsAsync", error);
  }
  expect(error).to.be.an('Error');
  if (errorMessage) {
    expect(error.message).to.equal(errorMessage);
  }
};
export { expectThrowsAsync };

// Returns the cid of an example DAG with nestings
export const spawnExampleDirDag = async () => {
  const structuredFiles: IpfsDirStructuredInput[] = [
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
    {
      path: 'd.txt',
      content: Buffer.from('D'),
    },
  ];

  const uploaded: IpfsPinnedResult[] = await pinDirectory(structuredFiles, true);
  const rootCid = uploaded[uploaded.length - 1].cid;
  return rootCid;
};

// create a test node
interface TestNode {
  cid: string;
  node: any;
  uuid: string;
}
export const createTestNode = async (owner: User, manifest: ResearchObjectV1): Promise<TestNode> => {
  const node = await prisma.node.create({
    data: {
      title: '',
      uuid: randomUUID64(),
      manifestUrl: '',
      replicationFactor: 0,
      restBody: '',
      ownerId: owner.id,
    },
  });
  debugger;
  const { cid } = await updateManifestAndAddToIpfs(manifest, { userId: owner.id, nodeId: node.id });

  return { cid, node, uuid: node.uuid!.slice(0, -1) };
};
