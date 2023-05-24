import { ResearchObjectComponentType, ResearchObjectV1, ResearchObjectV1Component } from '@desci-labs/desci-models';
import { DataReference, DataType } from '@prisma/client';
import { Request, Response, NextFunction } from 'express';

import prisma from 'client';
import { getDirectoryTree, moveFileInDag } from 'services/ipfs';
import { updateManifestComponentDagCids, neutralizePath } from 'utils/driveUtils';
import { recursiveFlattenTree, generateExternalCidMap } from 'utils/driveUtils';

import { updateManifestDataBucket } from './update';
import { getLatestManifest, persistManifest } from './utils';

export const moveData = async (req: Request, res: Response, next: NextFunction) => {
  const owner = (req as any).user;
  const { uuid, oldPath, newPath } = req.body;
  console.log(`[DATA::MOVE] oldPath: ${oldPath}, newPath: ${newPath} nodeUuid: ${uuid},  user: ${owner.id}`);
  if (uuid === undefined || oldPath === undefined || newPath === undefined)
    return res.status(400).json({ error: 'uuid, oldPath and newPath required' });
  // debugger;
  //validate requester owns the node
  const node = await prisma.node.findFirst({
    where: {
      ownerId: owner.id,
      uuid: uuid + '.',
    },
  });
  if (!node) {
    console.log(`[DATA::MOVE]unauthed node user: ${owner}, node uuid provided: ${uuid}`);
    return res.status(400).json({ error: 'failed' });
  }

  const latestManifest = await getLatestManifest(uuid, req.query?.g as string, node);
  const dataBucket = latestManifest?.components?.find((c) => c.type === ResearchObjectComponentType.DATA_BUCKET);

  try {
    /*
     ** New name collision check
     */
    const externalCidMap = await generateExternalCidMap(node.uuid);
    const oldFlatTree = recursiveFlattenTree(await getDirectoryTree(dataBucket.payload.cid, externalCidMap));
    const hasDuplicates = oldFlatTree.some((oldBranch) => neutralizePath(oldBranch.path).includes(newPath));
    if (hasDuplicates) {
      console.log('[DATA::MOVE] Rejected as duplicate paths were found');
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
    console.log('[DATA::MOVE] cleanContextPath: ', cleanContextPath, ' Moving: ', fileToMove, ' to : ', newPath);
    const { updatedDagCidMap, updatedRootCid } = await moveFileInDag(
      dataBucket.payload.cid,
      cleanContextPath,
      fileToMove,
      cleanNewPath,
    );

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

    const tree = await getDirectoryTree(updatedRootCid, externalCidMap);
    const flatTree = recursiveFlattenTree(tree);
    flatTree.push({
      cid: updatedRootCid,
      path: updatedRootCid,
      rootCid: updatedRootCid,
    });

    const dataRefsToUpdate: Partial<DataReference>[] = flatTree.map((f) => {
      if (typeof f.cid !== 'string') f.cid = f.cid.toString();
      return {
        cid: f.cid,
        rootCid: updatedRootCid,
        path: f.path,
      };
    });

    const dataRefUpdates = dataRefsToUpdate.map((newRef) => {
      const neutralPath = newRef.path.replace(updatedRootCid, 'root');
      const match = existingDataRefs.find((oldRef) => {
        const neutralRefPath = neutralizePath(oldRef.path);
        if (neutralRefPath === neutralPath) return true;
        if (neutralRefPath.startsWith(oldPath)) {
          const updatedPath = neutralRefPath.replace(oldPath, newPath);
          return updatedPath === neutralPath;
        }
        return false;
      });
      newRef.id = match?.id;
      return newRef;
    });

    const [...updates] = await prisma.$transaction([
      ...(dataRefUpdates as any).map((fd) => {
        return prisma.dataReference.update({ where: { id: fd.id }, data: fd });
      }),
    ]);
    console.log(`[DATA::MOVE] ${updates.length} dataReferences updated`);

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

    if (Object.keys(updatedDagCidMap).length) {
      updatedManifest = updateManifestComponentDagCids(updatedManifest, updatedDagCidMap);
    }

    const { persistedManifestCid } = await persistManifest({ manifest: updatedManifest, node, userId: owner.id });
    if (!persistedManifestCid)
      throw Error(`[DATA::MOVE]Failed to persist manifest: ${updatedManifest}, node: ${node}, userId: ${owner.id}`);

    console.log(`[DATA::MOVE] Success, path: `, oldPath, ' changed to: ', newPath);

    return res.status(200).json({
      manifest: updatedManifest,
      manifestCid: persistedManifestCid,
    });
  } catch (e: any) {
    console.log(`[DATA::MOVE] error: ${e}`);
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
