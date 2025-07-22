import { DriveObject, FileDir, findAndPruneNode } from '@desci-labs/desci-models';
import { Request, Response } from 'express';

import { prisma } from '../../client.js';
import { logger as parentLogger } from '../../logger.js';
import { getLatestDriveTime } from '../../services/draftTrees.js';
import { FileTreeService } from '../../services/FileTreeService.js';
import { NodeUuid } from '../../services/manifestRepo.js';
import { showNodeDraftManifest } from '../../services/nodeManager.js';
import { getTreeAndFill } from '../../utils/driveUtils.js';
import { ensureUuidEndsWithDot } from '../../utils.js';

import { ErrorResponse } from './update.js';

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

  const result = await FileTreeService.getPublishedTree({
    manifestCid,
    rootCid,
    uuid,
    dataPath,
    depth,
    manifestFetchGateway: req.query?.g as string,
    filterHiddenFiles: true, // Filter out .nodeKeep and .DS_Store files
  });

  if (result.isErr()) {
    const error = result.error;
    logger.error({ error }, 'Failed to get published tree');

    if (error.message === 'Published manifest PDR not found') {
      return res.status(404).json({ error: 'Published dataset not found' });
    }

    if (error.message === 'Manifest not found') {
      return res.status(404).json({ error: 'Manifest not found' });
    }

    if (error.message === 'Failed to retrieve tree') {
      return res.status(500).json({ error: 'Failed to retrieve tree data' });
    }

    return res.status(500).json({ error: 'Failed to retrieve published tree' });
  }

  const { tree, date } = result.value;
  return res.status(200).json({ tree, date });
};
