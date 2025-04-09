import { DocumentId } from '@automerge/automerge-repo';
import { ResearchObjectV1 } from '@desci-labs/desci-models';
import { DataType, Node, Prisma } from '@prisma/client';
import { Request, Response } from 'express';

import { prisma } from '../../client.js';
import { logger as parentLogger } from '../../logger.js';
import { getLatestDriveTime } from '../../services/draftTrees.js';
import { NodeUuid, getLatestManifestFromNode } from '../../services/manifestRepo.js';
import repoService from '../../services/repoService.js';
import { ensureUuidEndsWithDot } from '../../utils.js';

import { ErrorResponse } from './update.js';
import { persistManifest } from './utils.js';

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
      uuid: ensureUuidEndsWithDot(uuid),
    },
  });
  if (!node) {
    logger.warn(`DATA::Delete: auth failed, user id: ${owner.id} does not own node: ${uuid}`);
    return res.status(400).json({ error: 'failed' });
  }

  const latestManifest = await getLatestManifestFromNode(node);
  console.log('latestManifest', latestManifest);
  try {
    /**
     * Remove draft node tree entries, add them to the cid prune list
     */
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
        userId: owner.id,
        directory: e.directory,
      };
    });

    const existingDataRefs = owner.isGuest
      ? await prisma.guestDataReference.findMany({
          where: {
            nodeId: node.id,
            userId: owner.id,
            type: { not: DataType.MANIFEST },
          },
        })
      : await prisma.dataReference.findMany({
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
    console.log('[DELETE]::', deletions.count);
    logger.info(
      `DATA::Delete ${deletions.count} draftNodeTree entries deleted, ${creations.count} cidPruneList entries added, ${dataRefDeletions.count} dataReferences deleted`,
    );

    /*
     ** Delete components in Manifest, update DAG cids in manifest
     */
    const pathsToDelete = latestManifest.components
      .filter((c) => c.payload?.path?.startsWith(path + '/') || c.payload?.path === path)
      .map((c) => (c.payload?.path as string) || '');

    console.log('[DELETE]::Pre', { pathsToDelete, components: latestManifest.components.length });
    let updatedManifest = latestManifest;
    try {
      updatedManifest = await deleteComponentsFromManifest({
        node,
        pathsToDelete,
      });
      console.log('[DELETED]::Post', { pathsToDelete, components: latestManifest.components.length });
    } catch (err) {
      logger.error({ err }, 'Error: deleteComponentsFromManifest');
      console.log('[DELETE]::ERROR', { err, pathsToDelete, latestManifest });
    }

    const { persistedManifestCid } = await persistManifest({ manifest: updatedManifest, node, userId: owner.id });
    if (!persistedManifestCid)
      throw Error(`[DATA::DELETE]Failed to persist manifest: ${updatedManifest}, node: ${node}, userId: ${owner.id}`);

    logger.info(`DATA::Delete Success, path: `, path, ' deleted');

    /**
     * Update drive clock on automerge document
     */
    const latestDriveClock = await getLatestDriveTime(node.uuid as NodeUuid);
    try {
      const response = await repoService.dispatchAction({
        uuid,
        documentId: node.manifestDocumentId as DocumentId,
        actions: [{ type: 'Set Drive Clock', time: latestDriveClock }],
      });
      if (response?.manifest) {
        updatedManifest = response.manifest;
      }
      console.log('[getLatestDriveTime]::', { latestDriveClock, clock: response });
    } catch (err) {
      logger.error({ err }, 'Set Drive Clock');
    }

    console.log('[DELETE RETURN', { updatedManifest });
    return res.status(200).json({
      manifest: updatedManifest,
      manifestCid: persistedManifestCid,
    });
  } catch (e: any) {
    console.log('[ERROR]::[DeleteComponentsFromManifest]::', e);
    logger.error(e, `DATA::Delete error: ${e}`);
  }
  return res.status(400).json({ error: 'failed' });
};

interface UpdatingManifestParams {
  node: Node;
  pathsToDelete: string[];
}

export async function deleteComponentsFromManifest({ node, pathsToDelete }: UpdatingManifestParams) {
  parentLogger.info({ pathsToDelete }, `deleteComponentsFromManifest:`);
  const response = await repoService.dispatchAction({
    uuid: node.uuid,
    documentId: node.manifestDocumentId as DocumentId,
    actions: [{ type: 'Delete Components', paths: pathsToDelete }],
  });

  return response?.manifest;
}
