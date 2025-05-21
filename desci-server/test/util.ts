import { Prisma } from '@prisma/client';
import { expect } from 'chai';
import { subDays } from 'date-fn-latest';

import { prisma } from '../src/client.js';
import { sendMagicLink } from '../src/services/auth.js';
import { IpfsDirStructuredInput, IpfsPinnedResult, pinDirectory } from '../src/services/ipfs.js';

const expectThrowsAsync = async (method, errorMessage) => {
  let error: Error | null = null;
  try {
    await method();
  } catch (err) {
    error = err;
    // console.error("expectThrowsAsync", error);
  }
  expect(error).to.be.an('Error');
  if (errorMessage) {
    expect(error?.message).to.equal(errorMessage);
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

  const uploaded: IpfsPinnedResult[] = await pinDirectory(structuredFiles, { wrapWithDirectory: true });
  const rootCid = uploaded[uploaded.length - 1].cid;
  return rootCid;
};

export const createUsers = async (noOfUsers: number) => {
  const promises = new Array(noOfUsers).fill(0).map((_, index) =>
    prisma.user.create({
      data: {
        email: `user${index}@desci.com`,
        name: `User_${index}`,
      },
    }),
  );

  const users = await Promise.all(promises);
  return users;
};

export const createUsersWithCreatedAt = async (noOfUsers: number, createdAt: Date) => {
  const promises = new Array(noOfUsers).fill(0).map((_, index) =>
    prisma.user.create({
      data: {
        email: `user${index}@test.com`,
        name: `User_${index}`,
        createdAt: subDays(createdAt, index),
      },
    }),
  );

  const users = await Promise.all(promises);
  return users;
};

export const createDraftNode = async (data: Prisma.NodeUncheckedCreateInput) => {
  return prisma.node.create({
    data,
  });
};
export async function testingGenerateMagicCode(email: string) {
  await sendMagicLink(email);
  const magicLink = await prisma.magicLink.findFirst({
    where: {
      email: email,
    },
    orderBy: {
      createdAt: 'desc',
    },
  });
  return magicLink?.token;
}
