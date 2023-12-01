import {
  ResearchObjectComponentType,
  ResearchObjectV1,
  ResearchObjectV1Component,
  isNodeRoot,
  neutralizePath,
  recursiveFlattenTree,
} from '@desci-labs/desci-models';
import { DataType, Node } from '@prisma/client';
import { Request, Response } from 'express';

import prisma from 'client';
import parentLogger from 'logger';
import { updateManifestDataBucket } from 'services/data/processing';
import { ensureUniquePathsDraftTree } from 'services/draftTrees';
import { getDirectoryTree, renameFileInDag } from 'services/ipfs';
import { prepareDataRefs } from 'utils/dataRefTools';
import { generateExternalCidMap, updateManifestComponentDagCids } from 'utils/driveUtils';

import { ErrorResponse } from './update';
import { getLatestManifest, persistManifest, separateFileNameAndExtension } from './utils';

interface RenameResponse {
  status?: number;
  manifest: ResearchObjectV1;
  manifestCid: string;
}

export const renameData = async (req: Request, res: Response<RenameResponse | ErrorResponse | string>) => {
  const owner = (req as any).user;
  const { uuid, path, newName, renameComponent } = req.body;
  const logger = parentLogger.child({
    // id: req.id,
    module: 'DATA::RenameController',
    uuid: uuid,
    path: path,
    user: owner.id,
    newName: newName,
    renameComponent: renameComponent,
  });
  logger.trace('Entered DATA::Rename');

  if (uuid === undefined || path === undefined)
    return res.status(400).json({ error: 'uuid, path and newName required' });

  //validate requester owns the node
  const node: Node = await prisma.node.findFirst({
    where: {
      ownerId: owner.id,
      uuid: uuid.endsWith('.') ? uuid : uuid + '.',
    },
  });
  if (!node) {
    logger.warn(`DATA::Rename: auth failed, user id: ${owner.id} does not own node: ${uuid}`);
    return res.status(400).json({ error: 'failed' });
  }

  const latestManifest = await getLatestManifest(uuid, req.query?.g as string, node);
  // const dataBucket = latestManifest?.components?.find((c) => isNodeRoot(c));

  try {
    /*
     ** New name collision check
     */
    // const externalCidMap = await generateExternalCidMap(node.uuid);
    const contextPath = path.split('/').pop().join('/');
    await ensureUniquePathsDraftTree({ nodeId: node.id, contextPath, filesBeingAdded: [{ originalname: newName }] });

    // const oldFlatTree = recursiveFlattenTree(await getDirectoryTree(dataBucket.payload.cid, externalCidMap));
    const oldPathSplit = path.split('/');
    oldPathSplit.pop();
    oldPathSplit.push(newName);
    const newPath = oldPathSplit.join('/');
    // const hasDuplicates = oldFlatTree.some((oldBranch) => oldBranch.path.includes(newPath));
    // if (hasDuplicates) {
    //   logger.info('[DATA::Rename] Rejected as duplicate paths were found');
    //   return res.status(400).json({ error: 'Name collision' });
    // }

    /*
     ** Update in dag
     */
    // const splitContextPath = path.split('/');
    // splitContextPath.shift(); //remove root
    // const linkToRename = splitContextPath.pop();
    // const cleanContextPath = splitContextPath.join('/');
    // logger.debug(`DATA::Rename cleanContextPath: ${cleanContextPath},  Renaming: ${linkToRename},  to : ${newName}`);
    // const { updatedDagCidMap, updatedRootCid } = await renameFileInDag(
    //   dataBucket.payload.cid,
    //   cleanContextPath,
    //   linkToRename,
    //   newName,
    // );

    /*
     ** Updates old paths in the manifest component payloads to the new ones, updates the data bucket root CID and any DAG CIDs changed along the way
     */
    const updatedManifest = updateComponentPathsInManifest({
      manifest: latestManifest,
      oldPath: path,
      newPath: newPath,
    });

    // Update new name in draftTree db entry
    const updatedEntry = await prisma.draftNodeTree.update({
      where: { nodeId: node.id, path: path },
      data: { path: newPath },
    });

    if (updatedEntry.path !== newPath) {
      return res.status(400).json({ error: 'failed renaming in the draft tree' });
    }

    // updatedManifest = updateManifestDataBucket({
    //   manifest: updatedManifest,
    //   newRootCid: updatedRootCid,
    // });

    // if (Object.keys(updatedDagCidMap).length) {
    //   updatedManifest = updateManifestComponentDagCids(updatedManifest, updatedDagCidMap);
    // }

    if (renameComponent) {
      // If checkbox ticked to rename the component along with the filename, note: not used in capybara
      const componentIndex = updatedManifest.components.findIndex((c) => c.payload.path === newPath);
      const { fileName } = separateFileNameAndExtension(newName);
      updatedManifest.components[componentIndex].name = fileName;
    }

    /*
     ** Prepare updated refs
     */
    // const existingDataRefs = await prisma.dataReference.findMany({
    //   where: {
    //     nodeId: node.id,
    //     userId: owner.id,
    //     type: { not: DataType.MANIFEST },
    //   },
    // });

    // const newRefs = await prepareDataRefs(node.uuid, updatedManifest, updatedRootCid, false);

    // const existingRefMap = existingDataRefs.reduce((map, ref) => {
    //   map[neutralizePath(ref.path)] = ref;
    //   return map;
    // }, {});

    // const dataRefUpdates = newRefs.map((newRef) => {
    //   const neutralNewPath = neutralizePath(newRef.path);
    //   let match = existingRefMap[neutralNewPath]; // covers path unchanged refs
    //   if (!match) {
    //     // path changed in the rename op
    //     const updatedPath = neutralNewPath.replace(newPath, path); // adjusted for the old path
    //     match = existingRefMap[updatedPath];
    //   }
    //   if (!match) {
    //     logger.error({ refIteration: newRef }, 'failed to find an existing match for ref, node is missing refs');
    //     throw Error(`failed to find an existing match for ref, node is missing refs, path: ${newRef.path}`);
    //   }
    //   newRef.id = match?.id;
    //   return newRef;
    // });

    // const [...updates] = await prisma.$transaction([
    //   ...(dataRefUpdates as any).map((fd) => {
    //     return prisma.dataReference.update({ where: { id: fd.id }, data: fd });
    //   }),
    // ]);
    // logger.info(`[DATA::Rename] ${updates.length} dataReferences updated`);

    const { persistedManifestCid } = await persistManifest({ manifest: updatedManifest, node, userId: owner.id });
    if (!persistedManifestCid)
      throw Error(`[DATA::RENAME]Failed to persist manifest: ${updatedManifest}, node: ${node}, userId: ${owner.id}`);

    logger.info(`[DATA::Rename] Success, path: ${path} changed to: ${newPath}`);

    return res.status(200).json({
      manifest: updatedManifest,
      manifestCid: persistedManifestCid,
    });
  } catch (e: any) {
    logger.error(`[DATA::Rename] error: ${e}`);
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
    if (c.payload?.path.startsWith(oldPath + '/') || c.payload.path === oldPath) {
      manifest.components[idx].payload.path = c.payload.path.replace(oldPath, newPath);
    }
  });
  return manifest;
}
