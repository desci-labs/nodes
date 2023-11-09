import dotenv from 'dotenv';

import prisma from 'client';
dotenv.config({ path: '../.env' });

export const increaseBaseDriveStoragePreview = async (targetDriveStorageGb: number, shouldApply: boolean) => {
  const userCount = prisma.user.aggregate({
    // prisma count aggregation
    // https://www.prisma.io/docs/concepts/components/prisma-client/aggregation#count
    _count: {
      id: true,
    },
    where: {
      currentDriveStorageLimitGb: {
        lt: targetDriveStorageGb,
      },
    },
  });

  // get total users
  const totalUserCount = await prisma.user.count();

  const userStorageCount = prisma.$queryRaw`select count(1), "currentDriveStorageLimitGb" from "User" group by "currentDriveStorageLimitGb"`;

  console.log(
    `[increasesBaseDriveStorage] Affected users found: ${(await userCount)._count.id}/${totalUserCount} (${
      Math.floor(((await userCount)._count.id / totalUserCount) * 10000) / 100
    }%)`,
  );

  console.log(await userStorageCount);

  if (shouldApply) {
    // update users
    const users = await prisma.user.updateMany({
      where: {
        currentDriveStorageLimitGb: {
          lt: targetDriveStorageGb,
        },
      },
      data: {
        currentDriveStorageLimitGb: targetDriveStorageGb,
      },
    });
    console.log(`[increasesBaseDriveStorage] Updated ${users.count} users`);
  } else {
    console.log(
      `[increasesBaseDriveStorage] run with \`npm run script:increase-base-drive-storage ${targetDriveStorageGb} apply\` to apply changes`,
    );
  }
};

// get first arg
const targetDriveStorageGb = parseInt(process.argv[2]);
const shouldApply = process.argv[3] === 'apply';
console.log(process.argv);
console.log(`[increasesBaseDriveStorage] Target drive storage: ${targetDriveStorageGb} GB`);
increaseBaseDriveStoragePreview(targetDriveStorageGb, shouldApply)
  .then((result) => console.log('Done running script', result))
  .catch((err) => console.log('Error running script ', err));
