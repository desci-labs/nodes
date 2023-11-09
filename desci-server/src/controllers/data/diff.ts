import {
  ComponentStats,
  DriveObject,
  ResearchObjectComponentType,
  ResearchObjectV1,
  calculateComponentStats,
  createEmptyComponentStats,
  isNodeRoot,
  recursiveFlattenTree,
} from '@desci-labs/desci-models';
import axios from 'axios';
import { Request, Response } from 'express';

import prisma from 'client';
import { cleanupManifestUrl } from 'controllers/nodes';
import parentLogger from 'logger';
import { getFromCache, setToCache } from 'redisClient';
import { TreeDiff, diffTrees, subtractComponentStats, subtractNestedObjectValues } from 'utils/diffUtils';
import { getTreeAndFill } from 'utils/driveUtils';

import { ErrorResponse } from './update';

interface DiffResponse extends Diffs {
  status?: number;
}
interface Diffs {
  treeDiff: TreeDiff;
  sizeDiff: number;
  componentsDiff: Partial<ComponentStats>;
}

// Diffs a public node against another or a blank state (0diff)
export const diffData = async (req: Request, res: Response<DiffResponse | ErrorResponse | string>) => {
  //   const owner = (req as any).user;
  const { nodeUuid, manifestCidA, manifestCidB } = req.params;
  const logger = parentLogger.child({
    // id: req.id,
    module: 'DATA::DiffController',
    uuid: nodeUuid,
    manifestCidA,
    manifestCidB,
  });
  logger.trace('Entered DATA::Diff');

  if (nodeUuid === undefined || manifestCidA === undefined)
    return res.status(400).json({ error: 'uuid and manifestCidA query params required' });

  const cacheKey = `diff-${nodeUuid}-${manifestCidA}-${manifestCidB || 'blank'}`;

  const cachedDiffs = await getFromCache<Diffs | null>(cacheKey);
  if (cachedDiffs) return res.status(200).json(cachedDiffs);

  // ensure the node is valid
  const node = await prisma.node.findFirst({
    where: {
      uuid: nodeUuid.endsWith('.') ? nodeUuid : nodeUuid + '.',
    },
  });
  if (!node) {
    return res.status(400).json({ error: 'nodeUuid not found' });
  }

  // check if both manifestCids are public and valid
  const manifestAPubRef = await prisma.publicDataReference.findFirst({
    where: {
      cid: manifestCidA,
    },
  });
  const manifestBPubRef = await prisma.publicDataReference.findFirst({
    where: {
      cid: manifestCidB,
    },
  });

  if (!manifestAPubRef || !manifestBPubRef) {
    return res.status(400).json({ error: 'Invalid comparison manifestCids or unpublished nodes' });
  }

  const manifestUrlA = cleanupManifestUrl(manifestCidA);
  const manifestUrlB = manifestCidB ? cleanupManifestUrl(manifestCidB) : null;

  const manifestA = await axios.get<ResearchObjectV1>(manifestUrlA).then((res) => res.data);
  const manifestB = manifestUrlB ? await axios.get<ResearchObjectV1>(manifestUrlB).then((res) => res.data) : null;

  if (!manifestA) {
    logger.warn(`Failed to retrieve manifest from ${manifestUrlA}`);
    return res.status(400).json({ error: 'Failed to retrieve manifest' });
  }

  const dataBucketA = manifestA?.components?.find((c) => isNodeRoot(c));
  const dataBucketCidA = dataBucketA?.payload?.cid;
  const dataBucketB = manifestB ? manifestB?.components?.find((c) => isNodeRoot(c)) : null;
  const dataBucketCidB = manifestB ? dataBucketB?.payload?.cid : null;

  if (!dataBucketCidA) {
    logger.error(
      { diffsSuccessfullyGenerated: false, dataBucketA, dataBucketB },
      'Empty data bucket, failed to diff trees',
    );
    return res.status(400).json({ error: 'Failed to diff trees' });
  }

  const treeA = await getTreeAndFill(manifestA, nodeUuid, undefined, true);
  const treeB = manifestB ? await getTreeAndFill(manifestB, nodeUuid, undefined, true) : null;

  const flatTreeA = recursiveFlattenTree(treeA) as DriveObject[];
  const flatTreeB = treeB ? (recursiveFlattenTree(treeB) as DriveObject[]) : [];

  const treeASize = treeA[0].size;
  const treeBSize = treeB ? treeB[0].size : 0;
  const sizeDiff = treeASize - treeBSize;

  const treeAComponentsContained = calculateComponentStats(treeA[0]);
  const treeBComponentsContained = treeB ? calculateComponentStats(treeB[0]) : createEmptyComponentStats();
  const componentsDiff = subtractComponentStats(treeAComponentsContained, treeBComponentsContained);

  const treeDiff = diffTrees(flatTreeA, flatTreeB, {
    pruneThreshold: 1000,
    onThresholdExceeded: { onlyDirectories: true },
  });

  const diffs: Diffs = {
    treeDiff,
    sizeDiff,
    componentsDiff,
  };

  const hasDiffs = treeDiff && (sizeDiff !== null || sizeDiff !== undefined) && componentsDiff;

  if (hasDiffs) {
    await setToCache(cacheKey, diffs);
    return res.status(200).json(diffs);
  }

  logger.error(
    { diffsSuccessfullyGenerated: hasDiffs, manifestCidA, manifestCidB, dataBucketCidA, dataBucketCidB },
    'Failed to diff trees',
  );
  return res.status(400).json({ error: 'Failed to diff trees' });
};
