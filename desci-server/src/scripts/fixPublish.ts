import { prisma } from '../client.js';
import { logger as parentLogger } from '../logger.js';
import { redisClient } from '../redisClient.js';
import { publishSequencer, PublishServices } from '../services/PublishServices.js';
import { getIndexedResearchObjects } from '../theGraph.js';
import { hexToCid } from '../utils.js';

import { invalidateByUuid } from './invalidate-redis-cache.js';

const logger = parentLogger.child({ module: 'SCRIPTS::fix-publish' });
/*

Purposely built for fixing IJ imports
Runs the publish sequencer script on the nodes provided
Will only work for ceramic migrated nodes!

Usage Examples:
fixByNodeUuids:     OPERATION=fixByNodeUuids INVALIDATE_CACHE=true NODE_UUIDS=abc123,def456,ghi789 npm run script:fix-publish

// Add IJ publishStatus entries for the commitIds
fixByNodeUuids:     OPERATION=fixByNodeUuids CREATE_IJ_PUBLISH_STATUS_ENTRIES=true INVALIDATE_CACHE=true NODE_UUIDS=abc123,def456,ghi789 npm run script:fix-publish

*/
async function main() {
  logger.info(`[fixPublish]Starting fixPublish script`);
  try {
    const {
      operation,
      nodeUuids,
      createIjPublishStatusEntries: createIjPublishStatusEntry,
      invalidateCache,
    } = getOperationEnvs();
    switch (operation) {
      case 'fixByNodeUuids':
        if (!nodeUuids) return logger.error('Missing NODE_UUIDS env, a list of UUIDs seperated by commas');
        await fixByNodeUuids({ nodeUuids, invalidateCache, createIjPublishStatusEntry });
        break;
      default:
        logger.error('Invalid operation, valid operations include: fixByNodeUuids');
        return;
    }
  } catch (e) {
    const err = e as Error;
    console.error('Script failed:', err.message);
  } finally {
    await redisClient.quit();
  }
}

function getOperationEnvs() {
  return {
    operation: process.env.OPERATION || null,
    nodeUuids: process.env.NODE_UUIDS || null, // Seperated by commas
    invalidateCache: process.env.INVALIDATE_CACHE?.toLowerCase() === 'true',
    createIjPublishStatusEntries: process.env.CREATE_IJ_PUBLISH_STATUS_ENTRIES?.toLowerCase() === 'true',
  };
}

async function fixByNodeUuids({
  nodeUuids,
  invalidateCache,
  createIjPublishStatusEntry,
}: {
  nodeUuids: string;
  invalidateCache?: boolean;
  createIjPublishStatusEntry?: boolean;
}) {
  const nodeUuidsArr = nodeUuids.split(',');
  const total = nodeUuidsArr.length;
  logger.info(`[fixByNodeUuids] nodeUuids loaded for fixing: ${total}`);

  for (let index = 0; index < nodeUuidsArr.length; index++) {
    let nodeUuid = nodeUuidsArr[index];
    const cLogger = logger.child({ nodeUuid, index, total });
    try {
      if (!nodeUuid.endsWith('.')) nodeUuid += '.';
      cLogger.info(`[fixByNodeUuids] Fixing node ${index + 1}/${total}`);
      // Find all published versions of each node
      const { researchObjects } = await getIndexedResearchObjects([nodeUuid]);
      if (!researchObjects.length) {
        cLogger.error(`[fixByNodeUuids] Failed to resolve any public versions for this node`);
      }

      const indexedNode = researchObjects[0];
      const totalVersionsIndexed = indexedNode.versions.length || 0;
      cLogger.info(`[fixByNodeUuids] Found ${totalVersionsIndexed} versions for this node`);

      // Iterate through every version, call publish sequencer fn
      const ascendingVersions = indexedNode.versions.reverse();
      for (let nodeVersIdx = 0; nodeVersIdx < totalVersionsIndexed; nodeVersIdx++) {
        const hexCid = ascendingVersions[nodeVersIdx]?.cid;
        const manifestCid = hexToCid(hexCid);
        const commitId = ascendingVersions[nodeVersIdx]?.commitId;
        // const manifestUrl = cleanupManifestUrl(manifestCid);

        cLogger.info(`[fixByNodeUuids] Fixing version: ${nodeVersIdx + 1}, with commitId: ${commitId}`);

        if (createIjPublishStatusEntry) {
          // Add IJ publishStatus entry for the commitId
          await addIjPublishStatusEntry({ commitId, version: nodeVersIdx + 1, nodeUuid, manifestCid });
        }

        // Check for existing publishStatus entry for the commitId, throws if non existent
        const publishStatus = await PublishServices.getPublishStatusEntryByCommitId(commitId);

        const success = await publishSequencer({ commitId });
        cLogger.info(
          `[fixByNodeUuids] Completed version ${nodeVersIdx + 1} of node ${index + 1}/${total}, status: ${success ? 'SUCCESS' : 'FAILED'}`,
        );
      }

      if (invalidateCache) {
        // Invalidate cache for the node once every version is repaired
        invalidateByUuid({ nodeUuid });
      }
    } catch (e) {
      cLogger.info({ error: e }, `[fixByNodeUuids] Failed`);
    }
  }
}

/**
 * Purposefully built for adding IJ publishStatus entries to repair IJ nodes, can be repurposed or removed in the future
 **/
async function addIjPublishStatusEntry({
  commitId,
  version,
  nodeUuid,
  manifestCid,
}: {
  commitId: string;
  version: number;
  nodeUuid: string;
  manifestCid: string;
}) {
  try {
    const existingEntry = await prisma.publishStatus.findUnique({
      where: {
        commitId,
      },
    });
    if (existingEntry) return existingEntry;

    const nodeVersion = await prisma.nodeVersion.findFirst({
      where: {
        commitId,
      },
    });

    const newEntry = await prisma.publishStatus.create({
      data: {
        nodeUuid: nodeUuid,
        commitId,
        version,
        versionId: nodeVersion.id,
        manifestCid,
        // Hardcode everything except createPdr as complete
        ceramicCommit: true,
        assignDpid: true,
        handleNodeVersionEntry: true,
        fireDeferredEmails: true,
        fireNotifications: true,
        updateAttestations: true,
        transformDraftComments: true,
      },
    });
    return newEntry;
  } catch (e) {
    logger.error(
      { error: e, commitId, version, nodeUuid, manifestCid },
      '[fixByNodeUuids] Failed to add IJ publishStatus entry',
    );
    throw e;
  }
}

main();
