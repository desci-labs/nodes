import { MigrationType } from '@prisma/client';
import { Response } from 'express';
import { z } from 'zod';

import { prisma } from '../../../client.js';
import { logger as parentLogger } from '../../../logger.js';
import { DataMigrationService } from '../../../services/DataMigration/DataMigrationService.js';
import { AuthenticatedRequest } from '../../notifications/create.js';

const retryMigrationSchema = z.object({
  params: z.object({
    migrationId: z.coerce.number({
      required_error: 'Migration ID is required',
      invalid_type_error: 'Migration ID must be a number',
    }),
  }),
});

export const retryMigration = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const logger = parentLogger.child({
      module: 'Admin:RetryMigration',
      userId: req.user?.id,
      params: req.params,
    });

    const { params } = retryMigrationSchema.parse(req);
    const { migrationId } = params;

    const migration = await prisma.dataMigration.findUnique({
      where: { id: migrationId },
    });

    logger.info({ migration }, 'Retrying migration');

    if (!migration) {
      return res.status(404).json({ message: 'Migration not found' });
    }

    await DataMigrationService.queueDataMigrationJob(migration.id, MigrationType.GUEST_TO_PRIVATE);

    logger.info({ migration }, 'Migration queued for retry');

    return res.status(200).json({
      message: 'Migration queued for retry',
      migration: migration,
    });
  } catch (error) {
    console.error('Error retrying migration:', error);
    return res.status(500).json({
      message: 'Failed to retry migration',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};
