import { ResearchObjectV1, ResearchObjectV1Component, isNodeRoot, neutralizePath } from '@desci-labs/desci-models';
import { DataType } from '@prisma/client';
import { Request, Response } from 'express';

import { prisma } from '../../client.js';
import { logger as parentLogger } from '../../logger.js';
import { ensureUniquePathsDraftTree, getLatestDriveTime } from '../../services/draftTrees.js';
import { NodeUuid, getLatestManifestFromNode } from '../../services/manifestRepo.js';
import repoService from '../../services/repoService.js';
import { prepareDataRefsForDraftTrees } from '../../utils/dataRefTools.js';

import { ErrorResponse } from './update.js';
import { persistManifest } from './utils.js';

interface MoveResponse {
  status?: number;
  manifest: ResearchObjectV1;
  manifestCid: string;
}

export const moveData = async (req: Request, res: Response<MoveResponse | ErrorResponse | string>) => {
  const owner = (req as any).user;
  const { uuid, oldPath, newPath } = req.body;
  const logger = parentLogger.child({
    // id: req.id,
    module: 'DATA::MoveController',
    uuid: uuid,
    user: owner.id,
    oldPath: oldPath,
    newPath: newPath,
  });
  logger.trace(`DATA::Move entered`);
  if (uuid === undefined || oldPath === undefined || newPath === undefined)
    return res.status(400).json({ error: 'uuid, oldPath and newPath required' });
  // debugger;
  //validate requester owns the node
  const node = await prisma.node.findFirst({
    where: {
      ownerId: owner.id,
      uuid: uuid.endsWith('.') ? uuid : uuid + '.',
    },
  });
  if (!node) {
    logger.warn(`DATA::Move: auth failed, user id: ${owner.id} does not own node: ${uuid}`);
    return res.status(400).json({ error: 'failed' });
  }

  // const latestManifest = await getLatestManifestFromNode(node);

  try {
    const newPathSplit = newPath.split('/');
    const fileName = newPathSplit.pop();
    const newContextPath = newPathSplit.join('/');

    /*
     ** New path collision check
     */
    const noDuplicates = await ensureUniquePathsDraftTree({
      nodeId: node.id,
      contextPath: newContextPath,
      filesBeingAdded: [{ originalname: fileName }],
    });

    if (!noDuplicates) {
      logger.info('[DATA::Move] Rejected as duplicate paths were found');
      return res.status(400).json({ error: 'Name collision' });
    }

    /**
     * Update draftNodeTree entries for the move operation
     */

    const entriesToUpdate = await prisma.draftNodeTree.findMany({
      where: {
        nodeId: node.id,
        OR: [
          {
            path: {
              startsWith: oldPath + '/',
            },
          },
          {
            path: oldPath,
          },
        ],
      },
    });

    const updatesToPerform = entriesToUpdate.map((e) => {
      return {
        ...e,
        path: e.path.replace(oldPath, newPath),
      };
    });

    const [...updates] = await prisma.$transaction([
      ...(updatesToPerform as any).map((fd) => {
        return prisma.draftNodeTree.update({ where: { id: fd.id }, data: fd });
      }),
    ]);
    logger.info(`[DATA::Move] ${updates.length} draftNodeTree entries updated to perform the move operation`);

    /*
     ** Updates old paths in the manifest component payloads to the new ones, updates the data bucket root CID and any DAG CIDs changed along the way
     */
    let updatedManifest: ResearchObjectV1;

    try {
      const response = await repoService.dispatchAction({
        uuid,
        actions: [{ type: 'Rename Component Path', oldPath, newPath }],
      });
      updatedManifest = response ? response.manifest : await getLatestManifestFromNode(node);
    } catch (err) {
      logger.error({ err }, '[Source]: Rename Component Path');
      updatedManifest = await getLatestManifestFromNode(node);
    }

    /*
     ** Prepare updated refs
     */
    const existingDataRefs = await prisma.dataReference.findMany({
      where: {
        nodeId: node.id,
        userId: owner.id,
        type: { not: DataType.MANIFEST },
      },
    });

    const newRefs = await prepareDataRefsForDraftTrees(node.uuid, updatedManifest);
    const existingRefMap = existingDataRefs.reduce((map, ref) => {
      map[neutralizePath(ref.path)] = ref;
      return map;
    }, {});

    const dataRefsToUpdate = newRefs.map((newRef) => {
      // if paths are unchanged (unaffected by the move), their match is found in the line below
      let match = existingRefMap[newRef.path];
      if (!match) {
        // if paths are changed (affected by the move), their match should be found in the line below
        const wouldBeOldPath = newRef.path.replace(newPath, oldPath);
        match = existingRefMap[wouldBeOldPath];
      }
      if (match === undefined) {
        // In the move op, all data refs should have a match, if a match isn't found it indicates data refs were missing.
        throw Error(
          `[DATA::Move] Failed to find match for data ref:
          ${JSON.stringify(newRef)}
          node ${node.uuid} may need its data references healed.`,
        );
      }
      return { ...match, ...newRef };
    });

    const [...dataRefUpdates] = await prisma.$transaction([
      ...(dataRefsToUpdate as any).map((fd) => {
        return prisma.dataReference.update({ where: { id: fd.id }, data: fd });
      }),
    ]);
    logger.info(`[DATA::Move] ${dataRefUpdates.length} dataReferences updated`);

    const { persistedManifestCid } = await persistManifest({ manifest: updatedManifest, node, userId: owner.id });
    if (!persistedManifestCid)
      throw Error(`[DATA::MOVE]Failed to persist manifest: ${updatedManifest}, node: ${node}, userId: ${owner.id}`);

    logger.info(`[DATA::Move] Success, path: ${oldPath} changed to: ${newPath}`);

    /**
     * Update drive clock on automerge document
     */
    const latestDriveClock = await getLatestDriveTime(node.uuid as NodeUuid);
    try {
      const res = await repoService.dispatchAction({
        uuid,
        actions: [{ type: 'Set Drive Clock', time: latestDriveClock }],
      });
      if (res && res.manifest) {
        updatedManifest = res.manifest;
      }
    } catch (err) {
      logger.error({ err }, 'Set Drive Clock');
    }

    return res.status(200).json({
      manifest: updatedManifest,
      manifestCid: persistedManifestCid,
    });
  } catch (e: any) {
    console.log('MOVE ERROR', e);
    logger.error(`[DATA::Move] error: ${e}`);
  }
  return res.status(400).json({ error: 'failed' });
};
