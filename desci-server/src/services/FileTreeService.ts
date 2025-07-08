import { DriveObject, FileDir, findAndPruneNode, isNodeRoot } from '@desci-labs/desci-models';
import { DataType } from '@prisma/client';
import axios from 'axios';
import { ok, err, Result } from 'neverthrow';

import { prisma } from '../client.js';
import { logger as parentLogger } from '../logger.js';
import { redisClient, getOrCache } from '../redisClient.js';
import { getTreeAndFill, getTreeAndFillDeprecated } from '../utils/driveUtils.js';
import { cleanupManifestUrl } from '../utils/manifest.js';
import { ensureUuidEndsWithDot } from '../utils.js';

const logger = parentLogger.child({
  module: 'FileTreeService',
});

export enum DataReferenceSrc {
  PRIVATE = 'private',
  PUBLIC = 'public',
}

export interface PublishedTreeResponse {
  tree: DriveObject[] | FileDir[];
  date: string;
}

type GetPublishedTreeInput = {
  manifestCid: string;
  uuid: string;
  dataPath?: string;
  depth?: number;
  manifestFetchGateway?: string; // Almost never needed, supposedly if the manifests sit in a different IPFS cluster we may need this.
  rootCid?: string; // Only required for retrieving deprecated trees
};

async function getPublishedTree(data: GetPublishedTreeInput): Promise<Result<PublishedTreeResponse, Error>> {
  try {
    const { manifestCid, rootCid, uuid, dataPath = 'root', depth, manifestFetchGateway } = data;

    logger.trace({ fn: 'getPublishedTree', data }, 'Getting published tree');

    if (!manifestCid) {
      return err(new Error('No manifest CID provided'));
    }

    if (!uuid) {
      return err(new Error('No UUID provided'));
    }

    if (depth !== undefined && (isNaN(depth) || depth < 0)) {
      return err(new Error('Invalid depth parameter'));
    }

    const dataSource = DataReferenceSrc.PUBLIC;
    const manifestPDR = await prisma.publicDataReference.findFirst({
      where: {
        type: DataType.MANIFEST,
        cid: manifestCid,
        node: {
          uuid: ensureUuidEndsWithDot(uuid),
        },
      },
    });

    if (!manifestPDR) {
      logger.info({ fn: 'getPublishedTree', manifestCid, uuid }, 'Public manifest data reference not found');
      return err(new Error('Published manifest PDR not found'));
    }

    // Try early return if depth chunk cached
    const depthCacheKey = `pubTree-depth-${depth}-${manifestCid}-${dataPath}`;
    try {
      if (redisClient.isOpen) {
        const cached = await redisClient.get(depthCacheKey);
        if (cached) {
          const tree = JSON.parse(cached);
          logger.trace({ fn: 'getPublishedTree', depthCacheKey }, 'Returned cached tree');
          return ok({ tree, date: manifestPDR.updatedAt.toString() });
        }
      }
    } catch (error) {
      logger.debug({ fn: 'getPublishedTree', error, depthCacheKey }, 'Failed to retrieve from cache, continuing');
    }

    // Get manifest
    const manifestUrl = cleanupManifestUrl(manifestCid, manifestFetchGateway);
    const manifest = await (await axios.get(manifestUrl)).data;

    if (!manifest) {
      return err(new Error('Manifest not found'));
    }

    const hasDataBucket = manifest.components.find((c) => isNodeRoot(c));

    // !hasDataBucket === deprecated tree.
    const fetchCb = hasDataBucket
      ? async () => await getTreeAndFill(manifest, uuid, undefined, true)
      : async () => await getTreeAndFillDeprecated(rootCid, uuid, dataSource);

    const cacheKey = hasDataBucket ? `pub-filled-tree-${manifestCid}` : `deprecated-filled-tree-${rootCid}`;

    let filledTree;
    try {
      filledTree = await getOrCache(cacheKey, fetchCb as any);
      if (!filledTree) {
        throw new Error('Failed to retrieve tree from cache');
      }
    } catch (error) {
      logger.warn({ fn: 'getPublishedTree', error }, 'Error retrieving cached tree');
      logger.info({ fn: 'getPublishedTree' }, 'Falling back on uncached tree retrieval');
      try {
        filledTree = await fetchCb();
      } catch (retryError) {
        logger.error({ fn: 'getPublishedTree', error: retryError }, 'Retry error');
        return err(new Error('Failed to retrieve tree'));
      }
    }

    const depthTree = await getOrCache(depthCacheKey, async () => {
      const tree = hasDataBucket ? [findAndPruneNode(filledTree[0], dataPath, depth)] : filledTree;
      if (tree[0]?.type === 'file' && hasDataBucket) {
        const poppedDataPath = dataPath.substring(0, dataPath.lastIndexOf('/'));
        return hasDataBucket ? [findAndPruneNode(filledTree[0], poppedDataPath, depth)] : filledTree;
      } else {
        return tree;
      }
    });

    logger.info({ fn: 'getPublishedTree', uuid, manifestCid }, 'Successfully retrieved published tree');

    return ok({
      tree: depthTree,
      date: manifestPDR.updatedAt.toString(),
    });
  } catch (error) {
    logger.error({ fn: 'getPublishedTree', error, data }, 'Failed to get published tree');
    return err(
      error instanceof Error ? error : new Error('An unexpected error occurred while retrieving published tree'),
    );
  }
}

export const FileTreeService = {
  getPublishedTree,
};
