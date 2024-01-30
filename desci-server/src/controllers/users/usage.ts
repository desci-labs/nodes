import { User } from '@prisma/client';
import { Request, Response, NextFunction } from 'express';

import { getDataUsageForUserBytes, getPublicDataUsageForUserBytes } from '../../services/dataService.js';
import { gbToBytes } from '../../utils/driveUtils.js';

export const usage = async (req: Request, res: Response, next: NextFunction) => {
  const user = (req as any).user as User;

  const dataConsumptionBytes = await getDataUsageForUserBytes(user);

  const publicStorageBytes = await getPublicDataUsageForUserBytes(user);

  res.send({
    data: {
      consumption: dataConsumptionBytes - publicStorageBytes,
      limit: gbToBytes(user.currentDriveStorageLimitGb),
    },
  });
};
