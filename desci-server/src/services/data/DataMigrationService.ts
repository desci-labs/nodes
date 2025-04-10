import { MigrationStatus, MigrationType } from '@prisma/client';

import { prisma } from '../../client.js';
import { logger as parentLogger } from '../../logger.js';
import { ensureUuidEndsWithDot } from '../../utils.js';

const logger = parentLogger.child({
  module: 'Data::DataMigrationService',
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

type UnmigratedCidsMap = Record<cid, true>;

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

export const DataMigrationService = {
  getUnmigratedCidsMap,
};
