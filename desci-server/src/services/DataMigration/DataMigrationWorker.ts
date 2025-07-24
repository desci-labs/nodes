import { Message } from '@aws-sdk/client-sqs';
import { DataMigration, MigrationStatus, MigrationType } from '@prisma/client';

import { prisma } from '../../client.js';
import { logger as parentLogger } from '../../logger.js';
import { IPFS_NODE, migrateCidByPinning } from '../ipfs.js';
import { BaseSqsMessage, DataMigrationSqsMessage, SqsMessageType } from '../sqs/SqsMessageTypes.js';
import { sqsService } from '../sqs/SqsService.js';

import { DataMigrationService } from './DataMigrationService.js';
import { MigrationData } from './DataMigrationService.js';

const logger = parentLogger.child({
  module: 'DataMigration::DataMigrationWorker',
});

export class DataMigrationWorker {
  private isRunning = false;
  private shouldContinue = false;

  async start() {
    if (this.isRunning) return;

    // Don't start polling if SQS is not configured
    if (!sqsService.configured) {
      logger.info('Data migration worker not started - SQS not configured');
      return;
    }

    logger.info('Starting data migration worker');
    this.isRunning = true;
    this.shouldContinue = true;

    // Start polling with exponential backoff
    let backoffMs = 1000; // Start with 1 second

    while (this.shouldContinue) {
      try {
        const messageProcessed = await this.processMigrationMessage();

        // Reset backoff if we processed a message
        if (messageProcessed) {
          backoffMs = 1000;
        } else {
          // Increase backoff when no messages (up to 5 seconds)
          backoffMs = Math.min(backoffMs * 1.5, 5_000);
          await new Promise((resolve) => setTimeout(resolve, backoffMs));
        }
      } catch (error) {
        logger.error({ fn: 'start', error }, 'Error in data migration worker');
        // Add backoff on errors too
        await new Promise((resolve) => setTimeout(resolve, backoffMs));
      }
    }

    this.isRunning = false;
  }

  stop() {
    this.shouldContinue = false;
    logger.info('Data migration worker stopping (will finish current task)');
  }

  private visibilityTimeoutExtender(message: Message): NodeJS.Timeout {
    const visibilityExtender = setInterval(async () => {
      try {
        // Extend by 5 minutes each time
        await sqsService.extendMessageVisibility(message.ReceiptHandle, 300);
        logger.debug({ messageId: message.MessageId }, 'Extended message visibility timeout for 5 minutes');
      } catch (err) {
        logger.warn({ err, messageId: message.MessageId }, 'Failed to extend message visibility');
      }
    }, 240000); // Run every 4 minutes
    return visibilityExtender;
  }

  private async processMigrationMessage(): Promise<boolean> {
    const message = await sqsService.receiveMessage();
    if (!message) return false;

    logger.info({ fn: 'processMigrationMessage', messageId: message.MessageId }, 'Processing migration message');

    // Extend message visibility timeout while the migration is running
    // to prevent duplicate processing
    const visibilityTimeoutExtender = this.visibilityTimeoutExtender(message);

    try {
      const baseMessage: BaseSqsMessage = JSON.parse(message.Body);

      // Only process data migration messages
      if (baseMessage.messageType !== SqsMessageType.DATA_MIGRATION) {
        logger.debug({ messageType: baseMessage.messageType }, 'Ignoring non-data-migration message');
        clearInterval(visibilityTimeoutExtender);
        return false; // Don't delete, let other handlers process it
      }

      const { migrationId, migrationType } = baseMessage as DataMigrationSqsMessage;

      // Get migration record
      const migration = await prisma.dataMigration.findUnique({
        where: { id: migrationId },
      });

      if (!migration || migration.migrationStatus === MigrationStatus.COMPLETED) {
        logger.info(
          { fn: 'processMigrationMessage', migrationId, migrationStatus: migration?.migrationStatus },
          'Migration already completed or not found',
        );
        clearInterval(visibilityTimeoutExtender);
        await sqsService.deleteMessage(message.ReceiptHandle);
        return true;
      }

      // Process the migration
      if (migrationType === MigrationType.GUEST_TO_PRIVATE) {
        await this.processGuestToPrivateMigration(migration);
      }

      // Delete message from queue on completion
      clearInterval(visibilityTimeoutExtender);
      await sqsService.deleteMessage(message.ReceiptHandle);
      await DataMigrationService.cleanupGuestToPrivateMigration(migration.id);
      return true;
    } catch (error) {
      clearInterval(visibilityTimeoutExtender);
      logger.error({ fn: 'processMigrationMessage', error }, 'Error processing migration message');
      // Don't delete the message, let it become visible again after timeout
      return true; // Still count as processed for backoff purposes
    }
  }

  /**
   ** Process a migration directly, without using SQS for local development
   */
  async processDirectMigration(migrationId: number, migrationType: MigrationType): Promise<void> {
    logger.info({ fn: 'processDirectMigration', migrationId, migrationType }, 'Processing migration directly');

    try {
      // Get migration record
      const migration = await prisma.dataMigration.findUnique({
        where: { id: migrationId },
      });

      if (!migration || migration.migrationStatus === MigrationStatus.COMPLETED) {
        logger.info(
          { fn: 'processDirectMigration', migrationId, migrationStatus: migration?.migrationStatus },
          'Migration already completed or not found',
        );
        return;
      }

      // Process the migration
      if (migrationType === MigrationType.GUEST_TO_PRIVATE) {
        await this.processGuestToPrivateMigration(migration);
      }

      await DataMigrationService.cleanupGuestToPrivateMigration(migration.id);
    } catch (error) {
      logger.error({ fn: 'processDirectMigration', migrationId, error }, 'Error processing migration directly');
      throw error;
    }
  }

  private async processGuestToPrivateMigration(migration: DataMigration): Promise<void> {
    logger.info(
      { fn: 'processGuestToPrivateMigration', migrationId: migration.id },
      'Processing guest to private migration',
    );

    try {
      const migrationData = JSON.parse(migration.migrationData as string) as MigrationData;

      // Update migration status to in progress
      await prisma.dataMigration.update({
        where: { id: migration.id },
        data: { migrationStatus: MigrationStatus.IN_PROGRESS },
      });

      // Track overall migration progress
      let totalCids = 0;
      let completedCids = 0;
      let failedCids = 0;

      // Process each node in the migration
      for (const nodeUuid of Object.keys(migrationData.nodes)) {
        const nodeCids = migrationData.nodes[nodeUuid];

        // Calculate total CIDs for progress tracking
        totalCids += Object.keys(nodeCids).length;

        // Find all unmigrated CIDs for this node
        const unmigratedCids = Object.entries(nodeCids)
          .filter(([_, completed]) => !completed)
          .map(([cid, _]) => cid);

        logger.info(
          {
            fn: 'processGuestToPrivateMigration',
            migrationId: migration.id,
            nodeUuid,
            unmigratedCount: unmigratedCids.length,
          },
          'Processing unmigrated CIDs for node',
        );

        // Process each unmigrated CID
        for (const cid of unmigratedCids) {
          try {
            // Migrate the CID from guest to private IPFS
            // await migrateCid(cid, { fromIpfsNode: IPFS_NODE.GUEST, toIpfsNode: IPFS_NODE.PRIVATE });
            await migrateCidByPinning(cid, { destinationIpfsNode: IPFS_NODE.PRIVATE });

            // Update migration data to mark this CID as completed
            migrationData.nodes[nodeUuid][cid] = true;
            completedCids++;

            // Update migration record with progress
            await prisma.dataMigration.update({
              where: { id: migration.id },
              data: {
                migrationData: JSON.stringify(migrationData),
              },
            });

            logger.info(
              {
                fn: 'processGuestToPrivateMigration',
                migrationId: migration.id,
                nodeUuid,
                cid,
                progress: `${completedCids}/${totalCids}`,
              },
              'CID migration completed',
            );
          } catch (error) {
            failedCids++;
            logger.error(
              { fn: 'processGuestToPrivateMigration', migrationId: migration.id, nodeUuid, cid, error },
              'Failed to migrate CID',
            );
            // Continue with other CIDs even if one fails
          }
        }
      }

      // Check if all CIDs are migrated
      const allCompleted = Object.keys(migrationData.nodes).every((nodeUuid) =>
        Object.values(migrationData.nodes[nodeUuid]).every((completed) => completed === true),
      );

      // Update migration status
      await prisma.dataMigration.update({
        where: { id: migration.id },
        data: {
          migrationStatus: allCompleted ? MigrationStatus.COMPLETED : MigrationStatus.FAILED,
          migrationError: failedCids > 0 ? `Failed to migrate ${failedCids} CIDs` : null,
        },
      });

      logger.info(
        {
          fn: 'processGuestToPrivateMigration',
          migrationId: migration.id,
          total: totalCids,
          completed: completedCids,
          failed: failedCids,
          status: allCompleted ? 'COMPLETED' : 'FAILED',
        },
        'Migration processing finished',
      );
    } catch (error) {
      logger.error(
        { fn: 'processGuestToPrivateMigration', migrationId: migration.id, error },
        'Error processing migration',
      );

      // Update migration status to failed
      await prisma.dataMigration.update({
        where: { id: migration.id },
        data: {
          migrationStatus: MigrationStatus.FAILED,
          migrationError: error.message,
        },
      });

      throw error;
    }
  }
}

export const dataMigrationWorker = new DataMigrationWorker();
