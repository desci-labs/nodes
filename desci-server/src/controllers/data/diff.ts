import {
  ResearchObjectComponentType,
  ResearchObjectV1,
  ResearchObjectV1Component,
  neutralizePath,
  recursiveFlattenTree,
} from '@desci-labs/desci-models';
import { DataType } from '@prisma/client';
import { Request, Response } from 'express';

import prisma from 'client';
import parentLogger from 'logger';
import { getDirectoryTree, renameFileInDag } from 'services/ipfs';
import { prepareDataRefs } from 'utils/dataRefTools';
import { generateExternalCidMap, updateManifestComponentDagCids } from 'utils/driveUtils';

import { ErrorResponse, updateManifestDataBucket } from './update';
import { getLatestManifest, persistManifest, separateFileNameAndExtension } from './utils';

interface DiffResponse {
  status?: number;
  manifest: ResearchObjectV1;
  manifestCid: string;
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

  // check if both manifestCids are public
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

  const latestManifest = await getLatestManifest(uuid, req.query?.g as string, node);
  const dataBucket = latestManifest?.components?.find((c) => c.type === ResearchObjectComponentType.DATA_BUCKET);

  try {
    /*
     ** New name collision check
     */
    const externalCidMap = await generateExternalCidMap(node.uuid);
    const oldFlatTree = recursiveFlattenTree(await getDirectoryTree(dataBucket.payload.cid, externalCidMap));
    const oldPathSplit = path.split('/');
    oldPathSplit.pop();
    oldPathSplit.push(newName);
    const newPath = oldPathSplit.join('/');
    const hasDuplicates = oldFlatTree.some((oldBranch) => oldBranch.path.includes(newPath));
    if (hasDuplicates) {
      logger.info('[DATA::Rename] Rejected as duplicate paths were found');
      return res.status(400).json({ error: 'Name collision' });
    }

    /*
     ** Update in dag
     */
    const splitContextPath = path.split('/');
    splitContextPath.shift(); //remove root
    const linkToRename = splitContextPath.pop();
    const cleanContextPath = splitContextPath.join('/');
    logger.debug(`DATA::Rename cleanContextPath: ${cleanContextPath},  Renaming: ${linkToRename},  to : ${newName}`);
    const { updatedDagCidMap, updatedRootCid } = await renameFileInDag(
      dataBucket.payload.cid,
      cleanContextPath,
      linkToRename,
      newName,
    );

    /*
     ** Updates old paths in the manifest component payloads to the new ones, updates the data bucket root CID and any DAG CIDs changed along the way
     */
    let updatedManifest = updateComponentPathsInManifest({ manifest: latestManifest, oldPath: path, newPath: newPath });

    updatedManifest = updateManifestDataBucket({
      manifest: updatedManifest,
      dataBucketId: dataBucket.id,
      newRootCid: updatedRootCid,
    });

    if (Object.keys(updatedDagCidMap).length) {
      updatedManifest = updateManifestComponentDagCids(updatedManifest, updatedDagCidMap);
    }

    if (renameComponent) {
      const componentIndex = updatedManifest.components.findIndex((c) => c.payload.path === newPath);
      const { fileName } = separateFileNameAndExtension(newName);
      updatedManifest.components[componentIndex].name = fileName;
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

    const newRefs = await prepareDataRefs(node.uuid, updatedManifest, updatedRootCid, false);

    const existingRefMap = existingDataRefs.reduce((map, ref) => {
      map[neutralizePath(ref.path)] = ref;
      return map;
    }, {});

    const dataRefUpdates = newRefs.map((newRef) => {
      const neutralNewPath = neutralizePath(newRef.path);
      let match = existingRefMap[neutralNewPath]; // covers path unchanged refs
      if (!match) {
        // path changed in the rename op
        const updatedPath = neutralNewPath.replace(newPath, path); // adjusted for the old path
        match = existingRefMap[updatedPath];
      }
      if (!match) {
        logger.error({ refIteration: newRef }, 'failed to find an existing match for ref, node is missing refs');
        throw Error(`failed to find an existing match for ref, node is missing refs, path: ${newRef.path}`);
      }
      newRef.id = match?.id;
      return newRef;
    });

    const [...updates] = await prisma.$transaction([
      ...(dataRefUpdates as any).map((fd) => {
        return prisma.dataReference.update({ where: { id: fd.id }, data: fd });
      }),
    ]);
    logger.info(`[DATA::Rename] ${updates.length} dataReferences updated`);

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
