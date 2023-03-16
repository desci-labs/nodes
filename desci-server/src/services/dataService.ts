/**
 * Functions to assist with dataReference counting and storage for users
 */

import { User } from '@prisma/client';

import prisma from 'client';
import { gbToBytes } from 'utils/driveUtils';

export const getDataUsageForUserBytes = async (user: User) => {
  const dataConsumption = await prisma.dataReference.aggregate({
    _sum: {
      size: true,
    },
    where: {
      userId: user.id,
      directory: false,
    },
  });

  return dataConsumption._sum.size;
};

export const getPublicDataUsageForUserBytes = async (user: User) => {
  const publicStorage = await prisma.publicDataReference.aggregate({
    _sum: {
      size: true,
    },
    where: {
      userId: user.id,
      directory: false,
    },
  });

  return publicStorage._sum.size;
};

export const getAvailableDataUsageForUserBytes = async (user: User) => {
  const dataConsumptionBytes = await getDataUsageForUserBytes(user);
  const publicStorageBytes = await getPublicDataUsageForUserBytes(user);

  return dataConsumptionBytes - publicStorageBytes;
};

export const hasAvailableDataUsageForUpload = async (
  user: User,
  { fileSizeBytes }: { fileSizeBytes: number },
): Promise<boolean> => {
  const currentUsageBytes = await getAvailableDataUsageForUserBytes(user);
  const usersUploadLimitBytes = gbToBytes(user.currentDriveStorageLimitGb);

  const usageAfterUploadBytes = currentUsageBytes + fileSizeBytes;

  const hasSpaceForUpload = usageAfterUploadBytes <= usersUploadLimitBytes;

  console.log('dataService::hasAvailableDataUsageForUpload', {
    fileSizeBytes,
    currentUsageBytes,
    usersUploadLimitBytes,
    usageAfterUploadBytes,
    hasSpaceForUpload,
  });

  return hasSpaceForUpload;
};
