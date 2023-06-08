import { ResearchObjectComponentType, ResearchObjectV1, ResearchObjectV1Component } from '@desci-labs/desci-models';
import { DataReference, DataType } from '@prisma/client';
import { Request, Response, NextFunction } from 'express';

import prisma from 'client';
import parentLogger from 'logger';
import { getDirectoryTree, moveFileInDag } from 'services/ipfs';
import { prepareDataRefs } from 'utils/dataRefTools';
import { updateManifestComponentDagCids, neutralizePath } from 'utils/driveUtils';
import { recursiveFlattenTree, generateExternalCidMap } from 'utils/driveUtils';

import { updateManifestDataBucket } from './update';
import { getLatestManifest, persistManifest } from './utils';

export const moveData = async (req: Request, res: Response, next: NextFunction) => {
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

  const latestManifest = await getLatestManifest(uuid, req.query?.g as string, node);
  const dataBucket = latestManifest?.components?.find((c) => c.type === ResearchObjectComponentType.DATA_BUCKET);

  try {
    /*
     ** New path collision check
     */
    const externalCidMap = await generateExternalCidMap(node.uuid);
    const oldFlatTree = recursiveFlattenTree(await getDirectoryTree(dataBucket.payload.cid, externalCidMap));
    const hasDuplicates = oldFlatTree.some((oldBranch) => neutralizePath(oldBranch.path).includes(newPath));
    if (hasDuplicates) {
      logger.info('[DATA::Move] Rejected as duplicate paths were found');
      return res.status(400).json({ error: 'Name collision' });
    }

    /*
     ** Update in dag
     */
    const splitContextPath = oldPath.split('/');
    splitContextPath.shift(); //remove root
    const fileToMove = splitContextPath.pop();
    const cleanContextPath = splitContextPath.join('/');

    const splitNewPath = newPath.split('/');
    splitNewPath.shift(); //remove root
    const cleanNewPath = splitNewPath.join('/');
    logger.debug(`[DATA::Move] cleanContextPath: ${cleanContextPath}, Moving: ${fileToMove} to: ${newPath}`);
    const { updatedDagCidMap, updatedRootCid } = await moveFileInDag(
      dataBucket.payload.cid,
      cleanContextPath,
      fileToMove,
      cleanNewPath,
    );

    /*
     ** Updates old paths in the manifest component payloads to the new ones, updates the data bucket root CID and any DAG CIDs changed along the way
     */
    let updatedManifest = updateComponentPathsInManifest({
      manifest: latestManifest,
      oldPath: oldPath,
      newPath: newPath,
    });

    updatedManifest = updateManifestDataBucket({
      manifest: updatedManifest,
      dataBucketId: dataBucket.id,
      newRootCid: updatedRootCid,
    });

    // note: updatedDagCidMap here unreliable
    if (Object.keys(updatedDagCidMap).length) {
      updatedManifest = updateManifestComponentDagCids(updatedManifest, updatedDagCidMap);
    }

    /*
     ** Workaround for keeping manifest cids in sync
     */
    const flatTree = recursiveFlattenTree(await getDirectoryTree(updatedRootCid, externalCidMap));
    for (let i = 0; i < updatedManifest.components.length; i++) {
      const currentComponent = updatedManifest.components[i];
      if (currentComponent.payload.path === 'root' || currentComponent.type === ResearchObjectComponentType.LINK)
        continue; //skip data bucket and ext-links
      const match = flatTree.find((branch) => neutralizePath(branch.path) === currentComponent.payload.path);
      if (match) {
        updatedManifest.components[i].payload.cid = match?.cid;
        updatedManifest.components[i].payload.url = match?.cid;
      }
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

    const newRefs = await prepareDataRefs(node.uuid, updatedManifest, updatedRootCid);

    const dataRefsToUpdate = newRefs.map((newRef) => {
      const neutralizedNewRefPath = neutralizePath(newRef.path);
      const match = existingDataRefs.find((oldRef) => {
        const neutralizedOldRefPath = neutralizePath(oldRef.path);
        if (neutralizedOldRefPath.startsWith(oldPath)) {
          const replacedPath = neutralizePath(newRef.path).replace(newPath, oldPath);
          return neutralizedOldRefPath === replacedPath;
        } else {
          return neutralizedOldRefPath === neutralizedNewRefPath;
        }
      });
      if (match?.id) {
        newRef.id = match?.id;
      } else {
        logger.warn(
          `[DATA::Move] Failed to find match for data ref:
          ${newRef}
          node ${node.uuid} may need its data references healed.`,
        );
      }
      return newRef;
    });

    const [...updates] = await prisma.$transaction([
      ...(dataRefsToUpdate as any).map((fd) => {
        return prisma.dataReference.update({ where: { id: fd.id }, data: fd });
      }),
    ]);
    logger.info(`[DATA::Move] ${updates.length} dataReferences updated`);

    const { persistedManifestCid } = await persistManifest({ manifest: updatedManifest, node, userId: owner.id });
    if (!persistedManifestCid)
      throw Error(`[DATA::MOVE]Failed to persist manifest: ${updatedManifest}, node: ${node}, userId: ${owner.id}`);

    logger.info(`[DATA::Move] Success, path: ${oldPath} changed to: ${newPath}`);

    return res.status(200).json({
      manifest: updatedManifest,
      manifestCid: persistedManifestCid,
    });
  } catch (e: any) {
    logger.error(`[DATA::Move] error: ${e}`);
  }
  return res.status(400).json({ error: 'failed' });
};

interface UpdateComponentPathsInManifest {
  manifest: ResearchObjectV1;
  oldPath: string;
  newPath: string;
}

export function updateComponentPathsInManifest({ manifest, oldPath, newPath }: UpdateComponentPathsInManifest) {
  manifest.components.forEach((c: ResearchObjectV1Component, idx) => {
    if (c.payload?.path.startsWith(oldPath)) {
      manifest.components[idx].payload.path = c.payload.path.replace(oldPath, newPath);
    }
  });
  return manifest;
}
