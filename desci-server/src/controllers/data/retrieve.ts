import { DriveObject, FileDir, findAndPruneNode, isNodeRoot } from '@desci-labs/desci-models';
import { DataType } from '@prisma/client';
import axios from 'axios';
import { Request, Response } from 'express';

import { prisma } from '../../client.js';
import { logger as parentLogger } from '../../logger.js';
import { redisClient, getOrCache } from '../../redisClient.js';
import { getLatestDriveTime } from '../../services/draftTrees.js';
import { NodeUuid } from '../../services/manifestRepo.js';
import { showNodeDraftManifest } from '../../services/nodeManager.js';
import { getTreeAndFill, getTreeAndFillDeprecated } from '../../utils/driveUtils.js';
import { cleanupManifestUrl } from '../../utils/manifest.js';
import { ensureUuidEndsWithDot } from '../../utils.js';

import { ErrorResponse } from './update.js';

export enum DataReferenceSrc {
  PRIVATE = 'private',
  PUBLIC = 'public',
}

interface RetrieveResponse {
  status?: number;
  tree: DriveObject[];
  date: string;
}

export const retrieveTree = async (req: Request, res: Response<RetrieveResponse | ErrorResponse | string>) => {
  let ownerId = (req as any).user?.id;
  const manifestCid: string = req.params.manifestCid; // unused param
  const uuid: string = req.params.nodeUuid;
  const shareId: string = req.params.shareId;

  // Extract the query params
  const dataPath: string = (req.query.dataPath as string) || 'root';
  const depth: number = req.query.depth ? parseInt(req.query.depth as string) : undefined;

  if (isNaN(depth) && depth !== undefined) {
    return res.status(400).json({ error: 'Invalid depth' });
  }

  const logger = parentLogger.child({
    module: 'DATA::RetrieveController',
    uuid: uuid,
    manifestCid,
    user: ownerId,
    shareId: shareId,
  });

  logger.trace(`retrieveTree called, manifest cid received: ${manifestCid} uuid provided: ${uuid}`);
  let node = await prisma.node.findFirst({
    where: {
      ownerId: ownerId,
      uuid: ensureUuidEndsWithDot(uuid),
    },
  });

  if (shareId) {
    const privateShare = await prisma.privateShare.findFirst({
      where: { shareId },
      select: { node: true, nodeUUID: true },
    });
    if (!privateShare) {
      return res.status(404).send({ error: 'Invalid shareId' });
    }
    node = privateShare.node;

    if (privateShare && node) {
      ownerId = node.ownerId;
    }

    const verifiedOwner = await prisma.user.findFirst({ where: { id: ownerId } });
    if (!verifiedOwner || (verifiedOwner.id !== ownerId && verifiedOwner.id > 0)) {
      return res.status(400).send({ error: 'Invalid node owner' });
    }
  }
  if (!ownerId) {
    return res.status(401).send({ error: 'Unauthorized user' });
  }

  if (!node) {
    return res.status(400).send({ error: 'Node not found' });
  }

  if (!uuid) {
    return res.status(400).json({ error: 'no UUID provided' });
  }

  try {
    const manifest = await showNodeDraftManifest(node); // getLatestManifestFromNode(node);
    const filledTree = (await getTreeAndFill(manifest, uuid, ownerId)) ?? [];
    const latestDriveClock = getLatestDriveTime(node.uuid as NodeUuid);

    let tree = findAndPruneNode(filledTree[0], dataPath, depth);
    if (tree?.type === 'file' || tree === undefined) {
      // Logic to avoid returning files, if a file is the path requested, it returns its parent
      //tree can result in undefined if the dag link was recently renamed
      const poppedDataPath = dataPath.substring(0, dataPath.lastIndexOf('/'));
      tree = findAndPruneNode(filledTree[0], poppedDataPath, depth);
    }

    return res.status(200).json({ tree: [tree], date: await latestDriveClock });
  } catch (err) {
    logger.error({ err }, 'Failed to retrieve tree');
    return res.status(400).json({ error: 'retrieveTree failed' });
  }
};

interface PubTreeResponse {
  tree: DriveObject[] | FileDir[];
  date: string;
}

export const pubTree = async (req: Request, res: Response<PubTreeResponse | ErrorResponse | string>) => {
  const owner = (req as any).user;
  const manifestCid: string = req.params.manifestCid;
  const rootCid: string = req.params.rootCid;
  const uuid: string = req.params.nodeUuid;

  // Extract the query params
  const dataPath: string = (req.query.dataPath as string) || 'root';
  const depth: number = req.query.depth ? parseInt(req.query.depth as string) : undefined;

  if (isNaN(depth) && depth !== undefined) {
    return res.status(400).json({ error: 'Invalid depth' });
  }

  const logger = parentLogger.child({
    // id: req.id,
    module: 'DATA::RetrievePubTreeController',
    uuid: uuid,
    manifestCid,
    rootCid,
    user: owner?.id,
    dataPath,
    depth,
  });
  logger.trace(`pubTree called, cid received: ${manifestCid} uuid provided: ${uuid}`);
  if (!manifestCid) return res.status(400).json({ error: 'no manifest CID provided' });
  if (!uuid) return res.status(400).json({ error: 'no UUID provided' });

  // TODO: Later expand to datasets that aren't originated locally, currently the fn will fail if we don't store a pubDataRef to the dataset
  let dataSource = DataReferenceSrc.PRIVATE;
  const publicDataset = await prisma.publicDataReference.findFirst({
    where: {
      type: DataType.MANIFEST,
      cid: manifestCid,
      node: {
        uuid: ensureUuidEndsWithDot(uuid),
      },
    },
  });

  if (publicDataset) dataSource = DataReferenceSrc.PUBLIC;

  if (!publicDataset) {
    logger.info(
      `Databucket public data reference not found, manifest cid provided: ${manifestCid}, nodeUuid provided: ${uuid}`,
    );
    return res.status(400).json({ error: 'Failed to retrieve' });
  }

  // Try early return if depth chunk cached
  const depthCacheKey = `pubTree-depth-${depth}-${manifestCid}-${dataPath}`;
  try {
    if (redisClient.isOpen) {
      const cached = await redisClient.get(depthCacheKey);
      if (cached) {
        const tree = JSON.parse(cached);
        return res.status(200).json({ tree: tree, date: publicDataset?.updatedAt.toString() });
      }
    }
  } catch (err) {
    logger.debug({ err, depthCacheKey }, 'Failed to retrieve from cache, continuing');
  }

  const manifestUrl = cleanupManifestUrl(manifestCid as string, req.query?.g as string);

  const manifest = await (await axios.get(manifestUrl)).data;

  if (!uuid) return res.status(400).json({ error: 'Manifest not found' });

  const hasDataBucket = manifest.components.find((c) => isNodeRoot(c));

  const fetchCb = hasDataBucket
    ? async () => await getTreeAndFill(manifest, uuid, undefined, true)
    : async () => await getTreeAndFillDeprecated(rootCid, uuid, dataSource);

  const cacheKey = hasDataBucket ? `pub-filled-tree-${manifestCid}` : `deprecated-filled-tree-${rootCid}`;

  let filledTree;
  try {
    filledTree = await getOrCache(cacheKey, fetchCb as any);
    if (!filledTree) throw new Error('[pubTree] Failed to retrieve tree from cache');
  } catch (err) {
    logger.warn({ fn: 'pubTree', err }, '[pubTree] error');
    logger.info('[pubTree] Falling back on uncached tree retrieval');
    try {
      return await fetchCb();
    } catch (err2) {
      logger.error({ fn: 'pubTree', err: err2 }, '[pubTree] retrieve retry error');
      return res.status(400).json({ error: 'pubTree failed' });
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

  return res.status(200).json({ tree: depthTree, date: publicDataset.updatedAt.toString() });
};
