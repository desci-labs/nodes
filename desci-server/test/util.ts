import { AvailableUserActionLogTypes } from '@desci-labs/desci-models';
import { ActionType, InteractionLog, Node, Prisma, User } from '@prisma/client';
import { expect } from 'chai';
import {
  eachDayOfInterval,
  eachMonthOfInterval,
  eachWeekOfInterval,
  eachYearOfInterval,
  interval,
  subDays,
} from 'date-fn-latest';
import { v4 as uuidv4 } from 'uuid';

import { prisma } from '../src/client.js';
import { generateAccessToken } from '../src/controllers/auth/magic.js';
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

export interface MockUser {
  user: User;
  token: string;
}

export const randomInt = (min: number, max: number) => {
  return Math.floor(Math.random() * (max - min + 1)) + min;
};

// generate a random orcid
const generateOrcid = () => {
  return `0000-000${randomInt(1, 9)}-80${randomInt(1, 9)}0-${randomInt(1, 9)}${randomInt(1, 9)}${randomInt(1, 9)}X`;
};

export const createMockUsers = async (count: number, createdAt: Date, withOrcid?: boolean): Promise<MockUser[]> => {
  const promises = new Array(count).fill(0).map((_, index) =>
    prisma.user.create({
      data: {
        email: `user${index}_${uuidv4()}@test.com`,
        name: `User_${index}_${uuidv4()}`,
        createdAt,
        ...(withOrcid ? { orcid: generateOrcid() } : {}),
      },
    }),
  );

  const users = await Promise.all(promises);
  return users.map((user) => ({
    user,
    token: generateAccessToken({ email: user.email }),
  }));
};

export const logMockUserActions = async (
  users: MockUser[],
  action: AvailableUserActionLogTypes,
  date: Date,
): Promise<InteractionLog[]> => {
  const promises = users.map((entry, index) =>
    prisma.interactionLog.create({
      data: {
        userId: entry.user.id,
        createdAt: date,
        action: ActionType.USER_ACTION,
        extra: JSON.stringify({
          action,
        }),
      },
    }),
  );

  const interactions = await Promise.all(promises);
  return interactions;
};

export function sanitizeBigInts(obj: any): any {
  if (Array.isArray(obj)) {
    return obj.map(sanitizeBigInts);
  } else if (obj && typeof obj === 'object') {
    return Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, sanitizeBigInts(v)]));
  } else if (typeof obj === 'bigint') {
    return obj.toString();
  } else {
    return obj;
  }
}

export function createMockNodes(users: MockUser[], createdAt: Date) {
  return Promise.all(
    users.map((owner) =>
      createDraftNode({
        title: `Test Node ${randomInt(1, 1000000)}`,
        createdAt,
        ownerId: owner.user.id,
        manifestUrl: `bafkreibhcuvtojyratsjpqvte7lyxgcbluwi7p4c5ogs4lluyrdiurgmdi`,
        replicationFactor: 1,
        uuid: uuidv4(),
      }),
    ),
  );
}

export async function publishMockNode(node: Node, createdAt: Date) {
  await prisma.node.update({
    where: { id: node.id },
    data: {
      dpidAlias: node.dpidAlias ? node.dpidAlias : randomInt(100, 99999),
    },
  });

  return prisma.nodeVersion.create({
    data: {
      nodeId: node.id,
      manifestUrl: node.manifestUrl,
      createdAt,
      commitId: 'k3y52mos6605bnn40br13xp3gu5gbgbcktw1zlww98ha346j22ejm8ti9qfallzpc',
    },
  });
}

export function publishMockNodes(nodes: Node[], createdAt: Date) {
  return Promise.all(nodes.map((node) => publishMockNode(node, createdAt)));
}

export function viewNodes(nodes: Node[], userId: number, createdAt: Date) {
  return Promise.all(
    nodes.map((node) =>
      prisma.interactionLog.create({
        data: {
          userId,
          nodeId: node.id,
          action: ActionType.USER_ACTION,
          extra: JSON.stringify({
            action: AvailableUserActionLogTypes.viewedNode,
          }),
          createdAt,
        },
      }),
    ),
  );
}

export function likeNodes(nodes: Node[], userId: number, createdAt: Date) {
  return Promise.all(
    nodes.map((node) =>
      prisma.nodeLike.create({
        data: {
          nodeUuid: node.uuid!,
          userId,
          createdAt,
        },
      }),
    ),
  );
}

export const getAllDatesInInterval = (selectedDates: { from: string; to: string }, timeInterval: string) => {
  switch (timeInterval) {
    case 'daily':
      return selectedDates?.from && selectedDates?.to
        ? eachDayOfInterval(interval(selectedDates.from, selectedDates.to))
        : null;
    case 'weekly':
      return selectedDates?.from && selectedDates?.to
        ? eachWeekOfInterval(interval(selectedDates.from, selectedDates.to))
        : null;
    case 'monthly':
      return selectedDates?.from && selectedDates?.to
        ? eachMonthOfInterval(interval(selectedDates.from, selectedDates.to))
        : null;
    case 'yearly':
      return selectedDates?.from && selectedDates?.to
        ? eachYearOfInterval(interval(selectedDates.from, selectedDates.to))
        : null;
    default:
      return selectedDates?.from && selectedDates?.to
        ? eachDayOfInterval(interval(selectedDates.from, selectedDates.to))
        : null;
  }
};
