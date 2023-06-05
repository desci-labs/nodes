import { ResearchObjectComponentType, ResearchObjectV1 } from '@desci-labs/desci-models';
import { DataReference, DataType } from '@prisma/client';
import { Request, Response, NextFunction } from 'express';

import prisma from 'client';
import parentLogger from 'logger';
import { getDirectoryTree, removeFileFromDag } from 'services/ipfs';
import { deneutralizePath, updateManifestComponentDagCids, neutralizePath } from 'utils/driveUtils';
import { recursiveFlattenTree, generateExternalCidMap } from 'utils/driveUtils';

import { updateManifestDataBucket } from './update';
import { getLatestManifest, persistManifest } from './utils';

//Delete Dataset
export const deleteData = async (req: Request, res: Response, next: NextFunction) => {
  const owner = (req as any).user;
  const { uuid, path } = req.body;
  const logger = parentLogger.child({
    // id: req.id,
    module: 'DATA::DeleteController',
    uuid: uuid,
    path: path,
    user: owner.id,
  });
  logger.trace('Entered DATA::Delete');
  if (uuid === undefined || path === undefined) return res.status(400).json({ error: 'uuid and path required' });

  //validate requester owns the node
  const node = await prisma.node.findFirst({
    where: {
      ownerId: owner.id,
      uuid: uuid + '.',
    },
  });
  if (!node) {
    logger.warn(`DATA::Delete: auth failed, user id: ${owner.id} does not own node: ${uuid}`);
    return res.status(400).json({ error: 'failed' });
  }

  const latestManifest = await getLatestManifest(uuid, req.query?.g as string, node);
  const dataBucket = latestManifest?.components?.find((c) => c.type === ResearchObjectComponentType.DATA_BUCKET);

  try {
    /*
     ** Delete from DAG
     */
    const splitContextPath = path.split('/');
    splitContextPath.shift(); //remove root
    const pathToDelete = splitContextPath.pop();
    const cleanContextPath = splitContextPath.join('/');
    logger.debug('DATA::Delete cleanContextPath: ', cleanContextPath, ' Deleting: ', pathToDelete);
    const { updatedDagCidMap, updatedRootCid } = await removeFileFromDag(
      dataBucket.payload.cid,
      cleanContextPath,
      pathToDelete,
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

    const externalCidMap = await generateExternalCidMap(node.uuid);
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

    const dataRefUpdates = dataRefsToUpdate
      .filter((dref) => {
        const neutralPath = dref.path.replace(updatedRootCid, 'root');
        return !neutralPath.startsWith(path);
      })
      .map((dref) => {
        const neutralPath = dref.path.replace(updatedRootCid, 'root');
        const match = existingDataRefs.find((ref) => neutralizePath(ref.path) === neutralPath);
        dref.id = match?.id;
        return dref;
      });

    /*
     ** Delete dataRefs, add to cidPruneList
     */
    const deneutralizedPath = deneutralizePath(path, dataBucket?.payload?.cid);
    const dataRefsToDelete = existingDataRefs.filter((e) => e.path.startsWith(deneutralizedPath));

    const dataRefDeletionIds = dataRefsToDelete.map((e) => e.id);
    const formattedPruneList = dataRefsToDelete.map((e) => {
      return {
        description: '[DATA::DELETE]path: ' + path,
        cid: e.cid,
        type: e.type,
        size: e.size,
        nodeId: e.nodeId,
        userId: e.userId,
        directory: e.directory,
      };
    });

    const [deletions, creations, ...updates] = await prisma.$transaction([
      prisma.dataReference.deleteMany({ where: { id: { in: dataRefDeletionIds } } }),
      prisma.cidPruneList.createMany({ data: formattedPruneList }),
      ...(dataRefUpdates as any).map((fd) => {
        return prisma.dataReference.update({ where: { id: fd.id }, data: fd });
      }),
    ]);
    logger.info(
      `DATA::Delete ${deletions.count} dataReferences deleted, ${creations.count} cidPruneList entries added, ${updates.length} dataReferences updated`,
    );

    /*
     ** Delete components in Manifest, update DAG cids in manifest
     */
    const componentDeletionIds = latestManifest.components
      .filter((c) => c.payload?.path?.startsWith(path))
      .map((c) => c.id);

    let updatedManifest = deleteComponentsFromManifest({
      manifest: latestManifest,
      componentIds: componentDeletionIds,
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
      throw Error(`[DATA::DELETE]Failed to persist manifest: ${updatedManifest}, node: ${node}, userId: ${owner.id}`);

    logger.info(`DATA::Delete Success, path: `, path, ' deleted');

    return res.status(200).json({
      manifest: updatedManifest,
      manifestCid: persistedManifestCid,
    });
  } catch (e: any) {
    logger.error(`DATA::Delete error: ${e}`);
  }
  return res.status(400).json({ error: 'failed' });
};

interface UpdatingManifestParams {
  manifest: ResearchObjectV1;
  componentIds: string[];
}

export function deleteComponentsFromManifest({ manifest, componentIds }: UpdatingManifestParams) {
  for (const compId in componentIds) {
    const componentIndex = manifest.components.findIndex((c) => c.id === compId);
    manifest.components.splice(componentIndex, 1);
  }
  return manifest;
}
