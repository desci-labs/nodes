import {
  ComponentStats,
  DriveObject,
  ResearchObjectV1,
  calculateComponentStats,
  createEmptyComponentStats,
  isNodeRoot,
  recursiveFlattenTree,
} from '@desci-labs/desci-models';
import axios from 'axios';
import { Request, Response } from 'express';

import { prisma } from '../../client.js';
// import { cleanupManifestUrl } from 'controllers/nodes/';
import { logger as parentLogger } from '../../logger.js';
import { getFromCache, setToCache } from '../../redisClient.js';
import { TreeDiff, diffTrees, subtractComponentStats } from '../../utils/diffUtils.js';
import { getTreeAndFill } from '../../utils/driveUtils.js';

import { ErrorResponse } from './update.js';
import { cleanupManifestUrl } from '../../controllers/nodes/show.js';

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
  const user = (req as any).user;
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

  // ensure the node is valid
  const node = await prisma.node.findFirst({
    where: {
      uuid: nodeUuid.endsWith('.') ? nodeUuid : nodeUuid + '.',
    },
  });
  if (!node) {
    return res.status(400).json({ error: 'nodeUuid not found' });
  }

  /**
   * Ensure the user has read access to the manifests being diffed
   */
  let manifestAAuthed = false;
  let manifestBAuthed = false;
  if (manifestCidA) {
    // Attempt to find a public reference for given manifest CID
    const manifestAPubRef = await prisma.publicDataReference.findFirst({
      where: {
        cid: manifestCidA,
      },
    });
    if (manifestAPubRef) {
      manifestAAuthed = true;
    } else {
      // Attempt to find a private reference for given manifest CID, if user is AUTHED.
      if (!user?.id) return res.status(401).json({ error: `Unauthorized manifest: ${manifestCidA}` });
      const manifestAPrivRef = await prisma.dataReference.findFirst({
        where: {
          cid: manifestCidA,
          userId: user.id,
        },
      });
      if (manifestAPrivRef) manifestAAuthed = true;
    }
  }

  if (manifestCidB) {
    // Attempt to find a public reference for given manifest CID
    const manifestBPubRef = await prisma.publicDataReference.findFirst({
      where: {
        cid: manifestCidB,
      },
    });
    if (manifestBPubRef) {
      manifestBAuthed = true;
    } else {
      // Attempt to find a private reference for given manifest CID, if user is AUTHED.
      if (!user?.id) return res.status(401).json({ error: `Unauthorized manifest: ${manifestCidB}` });
      const manifestBPrivRef = await prisma.dataReference.findFirst({
        where: {
          cid: manifestCidB,
          userId: user.id,
        },
      });
      if (manifestBPrivRef) manifestBAuthed = true;
    }
  }

  // Manifest A Unauthed = fail
  if (!manifestAAuthed) return res.status(401).json({ error: `Unauthorized manifest: ${manifestCidA}` });
  // Manifest A Authed + Manifest B Unauthed = fail
  if (manifestAAuthed && manifestCidB && !manifestBAuthed)
    return res.status(401).json({ error: `Unauthorized manifest: ${manifestCidB}` });

  // Manifest A Authed + Blank = pass
  // Manifest A Authed + Manifest B Authed = pass

  const cacheKey = `diff-${nodeUuid}-${manifestCidA}-${manifestCidB || 'blank'}`;

  const cachedDiffs = await getFromCache<Diffs | null>(cacheKey);
  if (cachedDiffs) return res.status(200).json(cachedDiffs);

  // if (!manifestAPubRef || !manifestBPubRef) {
  //   return res.status(400).json({ error: 'Invalid comparison manifestCids or unpublished nodes' });
  // }

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
