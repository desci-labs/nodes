import { ResearchObjectV1, neutralizePath } from '@desci-labs/desci-models';
import { DataType, Node } from '@prisma/client';
import { Request, Response } from 'express';

import { prisma } from '../../client.js';
import { logger as parentLogger } from '../../logger.js';
import { ensureUniquePathsDraftTree, getLatestDriveTime } from '../../services/draftTrees.js';
import { NodeUuid, getLatestManifestFromNode, getNodeManifestUpdater } from '../../services/manifestRepo.js';
import { prepareDataRefsForDraftTrees } from '../../utils/dataRefTools.js';

import { ErrorResponse } from './update.js';
import { persistManifest, separateFileNameAndExtension } from './utils.js';

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
  const latestManifest = await getLatestManifestFromNode(node);

  try {
    /*
     ** New name collision check
     */
    // const externalCidMap = await generateExternalCidMap(node.uuid);
    const contextPathSplit = path.split('/');
    contextPathSplit.pop();
    const contextPath = contextPathSplit.join('/');
    // debugger;
    await ensureUniquePathsDraftTree({ nodeId: node.id, contextPath, filesBeingAdded: [{ originalname: newName }] });

    const oldPathSplit = path.split('/');
    oldPathSplit.pop();
    oldPathSplit.push(newName);
    const newPath = oldPathSplit.join('/');

    /*
     ** Updates old paths in the manifest component payloads to the new ones, updates the data bucket root CID and any DAG CIDs changed along the way
     */

    const dispatchChange = getNodeManifestUpdater(node);
    let updatedManifest = await dispatchChange({ type: 'Rename Component Path', oldPath: path, newPath });

    // Get all entries that need to be updated
    const entriesToUpdate = await prisma.draftNodeTree.findMany({
      where: {
        OR: [
          { nodeId: node.id, path: path },
          { nodeId: node.id, path: { startsWith: path + '/' } },
        ],
      },
    });

    // Update === with newPath, and .replace the ones that start with oldPath + "/"
    const updateOperations = entriesToUpdate.map((entry) => {
      const updatedPath = entry.path.startsWith(path + '/') ? entry.path.replace(path, newPath) : newPath;

      return prisma.draftNodeTree.update({
        where: { id: entry.id },
        data: { path: updatedPath },
      });
    });

    const updatedEntries = await Promise.all(updateOperations);

    if (renameComponent) {
      // If checkbox ticked to rename the component along with the filename, note: not used in capybara
      // const componentIndex = updatedManifest.components.findIndex((c) => c.payload.path === newPath);
      const { fileName } = separateFileNameAndExtension(newName);
      // updatedManifest.components[componentIndex].name = fileName;
      updatedManifest = await dispatchChange({ type: 'Rename Component', path: newPath, fileName });
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

    // const missingRefs = []; // for debugging
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
        // missingRefs.push(newRef);
      }
      newRef.id = match?.id;
      return newRef;
    });
    // debugger;
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

    /**
     * Update drive clock on automerge document
     */
    const latestDriveClock = await getLatestDriveTime(node.uuid as NodeUuid);
    const manifestUpdater = getNodeManifestUpdater(node);
    await manifestUpdater({ type: 'Set Drive Clock', time: latestDriveClock });

    return res.status(200).json({
      manifest: updatedManifest,
      manifestCid: persistedManifestCid,
    });
  } catch (e: any) {
    logger.error(e, `[DATA::Rename] error: ${e}`);
  }
  return res.status(400).json({ error: 'failed' });
};
