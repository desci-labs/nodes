import { ResearchObjectV1 } from '@desci-labs/desci-models';
import { Request, Response, NextFunction } from 'express';

import prisma from 'client';

import { persistManifest } from './utils';

//Delete Dataset
export const deleteDataset = async (req: Request, res: Response, next: NextFunction) => {
  const owner = (req as any).user;
  const { uuid, manifest, rootCid } = req.body;
  console.log('body: ', JSON.stringify(req.body));
  console.log('[DELETE DATASET] hit');
  if (uuid === undefined || manifest === undefined || rootCid === undefined)
    return res.status(400).json({ error: 'uuid, manifest, rootCid required' });
  const manifestObj: ResearchObjectV1 = JSON.parse(manifest);
  console.log('usr: ', owner);

  //validate requester owns the node
  const node = await prisma.node.findFirst({
    where: {
      ownerId: owner.id,
      uuid: uuid + '.',
    },
  });
  if (!node) {
    console.log(`unauthed node user: ${owner}, node uuid provided: ${uuid}`);
    return res.status(400).json({ error: 'failed' });
  }

  try {
    const dataRefsToDelete = await prisma.dataReference.findMany({
      where: {
        rootCid: rootCid,
        nodeId: uuid.id,
        userId: owner.id,
      },
    });

    const dataRefIds = dataRefsToDelete.map((e) => e.id);

    const formattedPruneList = dataRefsToDelete.map((e) => {
      return {
        description: '[DATASET::DELETE]',
        cid: e.cid,
        type: e.type,
        size: e.size,
        nodeId: e.nodeId,
        userId: e.userId,
        directory: e.directory,
      };
    });

    const deleteRes = await prisma.$transaction([
      prisma.dataReference.deleteMany({ where: { id: { in: dataRefIds } } }),
      prisma.cidPruneList.createMany({ data: formattedPruneList }),
    ]);
    console.log(
      `[DATASET::DELETE] ${deleteRes[0].count} dataReferences deleted, ${deleteRes[1].count} cidPruneList entries added.`,
    );

    const updatedManifest = deleteComponentFromManifest({
      manifest: manifestObj,
      componentId: rootCid,
    });
    const { persistedManifestCid } = await persistManifest({ manifest: updatedManifest, node, userId: owner.id });
    if (!persistedManifestCid)
      throw Error(`Failed to persist manifest: ${updatedManifest}, node: ${node}, userId: ${owner.id}`);

    return res.status(200).json({
      manifest: updatedManifest,
      manifestCid: persistedManifestCid,
    });
  } catch (e: any) {
    console.log(`[DATASET::DELETE] error: ${e}`);
  }
  return res.status(400).json({ error: 'failed' });
};

interface UpdatingManifestParams {
  manifest: ResearchObjectV1;
  componentId: string;
}

export function deleteComponentFromManifest({ manifest, componentId }: UpdatingManifestParams) {
  const componentIndex = manifest.components.findIndex((c) => c.id === componentId);
  manifest.components.splice(componentIndex, 1);
  return manifest;
}
