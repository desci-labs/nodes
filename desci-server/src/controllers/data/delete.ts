import { ResearchObjectV1 } from '@desci-labs/desci-models';
import { DataType, Prisma } from '@prisma/client';
import { Request, Response } from 'express';

import prisma from 'client';
import parentLogger from 'logger';

import { ErrorResponse } from './update';
import { getLatestManifest, persistManifest } from './utils';

interface DeleteResponse {
  status?: number;
  manifest: ResearchObjectV1;
  manifestCid: string;
}

//Delete Dataset
export const deleteData = async (req: Request, res: Response<DeleteResponse | ErrorResponse | string>) => {
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
      uuid: uuid.endsWith('.') ? uuid : uuid + '.',
    },
  });
  if (!node) {
    logger.warn(`DATA::Delete: auth failed, user id: ${owner.id} does not own node: ${uuid}`);
    return res.status(400).json({ error: 'failed' });
  }

  const latestManifest = await getLatestManifest(uuid, req.query?.g as string, node);

  try {
    /**
     * Remove draft node tree entries, add them to the cid prune list
     */
    // debugger;
    const entriesToDelete = await prisma.draftNodeTree.findMany({
      where: {
        nodeId: node.id,
        OR: [
          {
            path: {
              startsWith: path + '/',
            },
          },
          {
            path: path,
          },
        ],
      },
    });

    const entriesToDeleteIds = entriesToDelete.map((e) => e.id);

    const formattedPruneList: Prisma.CidPruneListCreateManyInput[] = entriesToDelete.map((e) => {
      return {
        description: '[DATA::DELETE db]path: ' + e.path,
        cid: e.cid,
        type: DataType.UNKNOWN,
        size: e.size,
        nodeId: e.nodeId,
        userId: e.userId,
        directory: e.directory,
      };
    });

    const existingDataRefs = await prisma.dataReference.findMany({
      where: {
        nodeId: node.id,
        userId: owner.id,
        type: { not: DataType.MANIFEST },
      },
    });

    const dataRefsToDelete = existingDataRefs.filter((e) => e.path.startsWith(path + '/') || e.path === path);

    const dataRefDeletionIds = dataRefsToDelete.map((e) => e.id);

    const [deletions, creations, dataRefDeletions] = await prisma.$transaction([
      prisma.draftNodeTree.deleteMany({ where: { id: { in: entriesToDeleteIds } } }),
      prisma.cidPruneList.createMany({ data: formattedPruneList }),
      prisma.dataReference.deleteMany({ where: { id: { in: dataRefDeletionIds } } }),
    ]);
    logger.info(
      `DATA::Delete ${deletions.count} draftNodeTree entries deleted, ${creations.count} cidPruneList entries added, ${dataRefDeletions.count} dataReferences deleted`,
    );

    /*
     ** Delete components in Manifest, update DAG cids in manifest
     */
    const componentDeletionIds = latestManifest.components
      .filter((c) => c.payload?.path?.startsWith(path + '/') || c.payload?.path === path)
      .map((c) => c.id);

    const updatedManifest = deleteComponentsFromManifest({
      manifest: latestManifest,
      componentIds: componentDeletionIds,
    });

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
