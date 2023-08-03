import {
  DriveObject,
  ResearchObjectComponentType,
  ResearchObjectV1,
  recursiveFlattenTree,
} from '@desci-labs/desci-models';
import axios from 'axios';
import { Request, Response } from 'express';

import prisma from 'client';
import { cleanupManifestUrl } from 'controllers/nodes';
import parentLogger from 'logger';
import { getDirectoryTree } from 'services/ipfs';
import { TreeDiff, diffTrees } from 'utils/diffUtils';
import { generateExternalCidMap } from 'utils/driveUtils';

import { ErrorResponse } from './update';

interface DiffResponse {
  status?: number;
  diff: TreeDiff;
}

// Diffs two public nodes
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

  if (nodeUuid === undefined || manifestCidA === undefined || manifestCidB === undefined)
    return res.status(400).json({ error: 'uuid, manifestCidA and manifestCidB query params required' });

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
  const manifestUrlB = cleanupManifestUrl(manifestCidB);

  const manifestA = await axios.get<ResearchObjectV1>(manifestUrlA).then((res) => res.data);
  const manifestB = await axios.get<ResearchObjectV1>(manifestUrlB).then((res) => res.data);
  if (!manifestA || !manifestB) {
    logger.warn(`Failed to retrieve manifest from ${manifestUrlA} or ${manifestUrlB}`);
    return res.status(400).json({ error: 'Failed to retrieve manifest' });
  }

  const dataBucketCidA = manifestA?.components?.find((c) => c.type === ResearchObjectComponentType.DATA_BUCKET).payload
    ?.cid;
  const dataBucketCidB = manifestB?.components?.find((c) => c.type === ResearchObjectComponentType.DATA_BUCKET).payload
    ?.cid;

  const externalCidMapA = await generateExternalCidMap(nodeUuid, dataBucketCidA);
  const externalCidMapB = await generateExternalCidMap(nodeUuid, dataBucketCidB);

  const flatTreeA = recursiveFlattenTree(await getDirectoryTree(dataBucketCidA, externalCidMapA)) as DriveObject[];
  const flatTreeB = recursiveFlattenTree(await getDirectoryTree(dataBucketCidB, externalCidMapB)) as DriveObject[];

  const diff = diffTrees(flatTreeA, flatTreeB);

  if (diff) {
    return res.status(200).json({ diff });
  }

  logger.error({ diff, manifestA, manifestB, dataBucketCidA, dataBucketCidB }, 'Failed to diff trees');
  return res.status(400).json({ error: 'Failed to diff trees' });
};
