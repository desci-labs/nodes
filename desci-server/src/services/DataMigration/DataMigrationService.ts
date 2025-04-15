import { MigrationCleanupStatus, MigrationStatus, MigrationType } from '@prisma/client';

import { prisma } from '../../client.js';
import { logger as parentLogger } from '../../logger.js';
import { transformGuestDataRefsToDataRefs } from '../../utils/dataRefTools.js';
import { ensureUuidEndsWithDot } from '../../utils.js';
import { IPFS_NODE, isCidPinned, removeCid } from '../ipfs.js';
import { sqsService } from '../sqs/SqsService.js';

const logger = parentLogger.child({
  module: 'DataMigration::DataMigrationService',
});

type cid = string;
type uuid = string;
type isCompleted = boolean;

export interface MigrationData {
  /**
   * Map of nodes being migrated
   * @property {Object} nodes - Nodes indexed by their UUID
   */
  nodes: {
    /**
     * Node UUID with a dot as key, with CIDs and their completion status as values
     * @property {Object} [uuid] - Map of CIDs and their migration status
     */
    [key: uuid]: {
      [key: cid]: isCompleted;
    };
  };
}

/**
 * Queue a migration from guest IPFS to private IPFS for a node
 * @param nodeUuid The UUID of the node to migrate
 * @param userId The ID of the user who owns the node
 */
async function queueGuestToPrivateMigration(userId: number): Promise<void> {
  logger.info({ fn: 'queueGuestToPrivateMigration', userId }, 'Queuing guest to private migration');

  try {
    // Gather all guestDataReferences for this user
    const guestRefs = await prisma.guestDataReference.findMany({
      where: {
        userId: userId,
      },
      include: {
        node: true,
      },
    });

    // Create regular dataReferences
    const dataRefs = transformGuestDataRefsToDataRefs(
      guestRefs.map((ref) => {
        const sanitizedRef = { ...ref };
        delete sanitizedRef.node;
        return sanitizedRef;
      }),
      true,
    );

    if (guestRefs.length === 0) {
      logger.info({ fn: 'queueGuestToPrivateMigration', userId }, 'No guest data found for user');
      return;
    }

    const createdDataRefs = await prisma.dataReference.createMany({
      data: dataRefs,
    });

    logger.info(
      { fn: 'queueGuestToPrivateMigration', userId, totalCreatedDataRefs: createdDataRefs.count },
      'Created data references',
    );

    // Create MigrationData list for CIDS to be migrated
    const migrationData: MigrationData = {
      nodes: guestRefs.reduce(
        (acc, ref) => {
          const nodeUuid = ref.node.uuid;
          if (!acc[nodeUuid]) {
            acc[nodeUuid] = {};
          }
          if (ref.directory === false) {
            acc[nodeUuid][ref.cid] = false;
          }
          return acc;
        },
        {} as MigrationData['nodes'],
      ),
    };

    const nodeUuidsInvolved = Object.keys(migrationData.nodes);

    // Create migration record
    const migration = await prisma.dataMigration.create({
      data: {
        migrationType: MigrationType.GUEST_TO_PRIVATE,
        migrationStatus: MigrationStatus.PENDING,
        migrationData: JSON.stringify(migrationData),
        cleanupStatus: MigrationCleanupStatus.PENDING,
        userId: userId,
        nodes: {
          connect: nodeUuidsInvolved.map((nodeUuid) => ({
            uuid: nodeUuid,
          })),
        },
      },
    });

    await sqsService.sendMessage({
      migrationId: migration.id,
      migrationType: MigrationType.GUEST_TO_PRIVATE,
    });

    logger.info(
      {
        fn: 'queueGuestToPrivateMigration',
        migrationId: migration.id,
        nodeCount: nodeUuidsInvolved.length,
        cidCount: Object.keys(migrationData.nodes).reduce(
          (count, nodeUuid) => count + Object.keys(migrationData.nodes[nodeUuid]).length,
          0,
        ),
      },
      'Migration queued',
    );
  } catch (error) {
    logger.error({ fn: 'queueGuestToPrivateMigration', userId, error }, 'Failed to queue migration');
    throw error;
  }
}

export type UnmigratedCidsMap = Record<cid, true>;

/**
 * Get a map of unmigrated CIDs for a given node UUID, data retrieval should be sourced accordingly.
 * @param {string} nodeUuid - The UUID of the node to get unmigrated CIDs for
 * @returns {Promise<UnmigratedCidsMap>} A map of unmigrated CIDs
 */
async function getUnmigratedCidsMap(nodeUuid: uuid, migrationType: MigrationType): Promise<UnmigratedCidsMap> {
  nodeUuid = ensureUuidEndsWithDot(nodeUuid);

  const dataMigration = await prisma.dataMigration.findFirst({
    where: {
      migrationType,
      migrationStatus: { not: MigrationStatus.COMPLETED },
      nodes: {
        some: {
          uuid: nodeUuid,
        },
      },
    },
  });
  if (!dataMigration) {
    return {};
  }
  const migrationData = JSON.parse(dataMigration?.migrationData as string) as MigrationData;
  const nodeCids = migrationData?.nodes[nodeUuid];
  const unmigratedCids = Object.keys(nodeCids).reduce((acc, cid) => {
    if (!nodeCids[cid]) {
      acc[cid] = true;
    }
    return acc;
  }, {} as UnmigratedCidsMap);
  return unmigratedCids;
}

/**
 * Cleanup after a GUEST -> PRIVATE migration
 ** Checks if all CIDs are migrated
 ** Checks if all CIDs are pinned
 ** Checks if any other data references exist with the same CIDs
 ** Deletes the data from GUEST ipfs
 ** Deletes the guestDataReferences
 ** Marks migration cleanup as complete
 */
async function cleanupGuestToPrivateMigration(migrationId: number): Promise<void> {
  try {
    const migration = await prisma.dataMigration.findUnique({
      where: { id: migrationId },
    });

    // Update cleanup status to IN_PROGRESS
    await prisma.dataMigration.update({
      where: { id: migrationId },
      data: { cleanupStatus: MigrationCleanupStatus.IN_PROGRESS },
    });

    const migrationData = JSON.parse(migration?.migrationData as string) as MigrationData;
    const allCidsMigrated = Object.values(migrationData.nodes).every((nodeCids) =>
      Object.values(nodeCids).every((cidIsMigrated) => cidIsMigrated === true),
    );
    if (!allCidsMigrated) {
      throw new Error('Not all CIDs migrated');
    }

    const cidsInvolved = Object.keys(migrationData.nodes).flatMap((nodeUuid) =>
      Object.keys(migrationData.nodes[nodeUuid]),
    );

    // Check if all CIDs are pinned
    const cidPins = await Promise.all(cidsInvolved.map((cid) => isCidPinned(cid, IPFS_NODE.PRIVATE)));
    const allCidsPinned = cidPins.every((pin) => pin.isPinned === true);
    if (!allCidsPinned) {
      throw new Error('Not all CIDs pinned');
    }

    // Check if any other guest data references exist with the same CIDs
    const otherDataRefs = await prisma.guestDataReference.findMany({
      where: {
        cid: { in: cidsInvolved },
        userId: { not: migration.userId },
      },
    });

    // Map of the CIDs that have a guest data reference from another user.
    const unsafeDeleteCidMap = otherDataRefs.reduce(
      (acc, ref) => {
        acc[ref.cid] = true;
        return acc;
      },
      {} as Record<cid, true>,
    );

    // These CIDs don't have another guest data ref from another user, if they're already
    // migrated then we can delete them from GUEST ipfs.
    const cidsSafeToDelete = cidsInvolved.filter((cid) => !unsafeDeleteCidMap[cid]);

    // Delete the data from the GUEST ipfs node
    await Promise.all(cidsSafeToDelete.map((cid) => removeCid(cid, IPFS_NODE.GUEST)));

    // Delete the guestDataReferences
    const guestRefsToDelete = await prisma.guestDataReference.findMany({
      where: {
        userId: migration.userId,
        cid: { in: cidsInvolved },
      },
    });
    await prisma.guestDataReference.deleteMany({
      where: {
        id: { in: guestRefsToDelete.map((ref) => ref.id) },
      },
    });

    // Update cleanup status to COMPLETED
    await prisma.dataMigration.update({
      where: { id: migrationId },
      data: { cleanupStatus: MigrationCleanupStatus.COMPLETED },
    });
  } catch (error) {
    logger.error({ fn: 'cleanupGuestToPrivateMigration', migrationId, error }, 'Failed to cleanup migration');
    await prisma.dataMigration.update({
      where: { id: migrationId },
      data: { cleanupStatus: MigrationCleanupStatus.FAILED },
    });
  }
}
export const DataMigrationService = {
  getUnmigratedCidsMap,
  queueGuestToPrivateMigration,
  cleanupGuestToPrivateMigration,
};
