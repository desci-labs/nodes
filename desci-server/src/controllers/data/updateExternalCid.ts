import {
  IpfsPinnedResult,
  RecursiveLsResult,
  deneutralizePath,
  isNodeRoot,
  neutralizePath,
  recursiveFlattenTree,
} from '@desci-labs/desci-models';
import { DataType, User } from '@prisma/client';
import axios from 'axios';
import { Response, Request } from 'express';

import { prisma } from '../../client.js';
import { logger as parentLogger } from '../../logger.js';
import { updateManifestDataBucket } from '../../services/data/processing.js';
import {
  FilesToAddToDag,
  GetExternalSizeAndTypeResult,
  addFilesToDag,
  convertToCidV1,
  getDirectoryTree,
  getExternalCidSizeAndType,
  isDir,
  pinExternalDags,
  pubRecursiveLs,
} from '../../services/ipfs.js';
import { prepareDataRefsExternalCids } from '../../utils/dataRefTools.js';
import {
  FirstNestingComponent,
  ROTypesToPrismaTypes,
  addComponentsToManifest,
  generateExternalCidMap,
  generateManifestPathsToDbTypeMap,
  getTreeAndFill,
  inheritComponentType,
  updateManifestComponentDagCids,
} from '../../utils/driveUtils.js';
import { cleanupManifestUrl } from '../../utils/manifest.js';

import { ErrorResponse, UpdateResponse } from './update.js';
import { persistManifest } from './utils.js';

export const updateExternalCid = async (req: Request, res: Response<UpdateResponse | ErrorResponse | string>) => {
  const owner = (req as any).user as User;
  const { uuid, contextPath, componentType, componentSubtype } = req.body;
  let { externalCids } = req.body;

  const logger = parentLogger.child({
    // id: req.id,
    module: 'DATA::UpdateExternalCidController',
    userId: owner.id,
    uuid: uuid,
    contextPath: contextPath,
    componentType: componentType,
    componentSubtype,
    externalCids,
  });

  logger.trace(`[UPDATE DATASET] Updating in context: ${contextPath}`);
  if (uuid === undefined || contextPath === undefined)
    return res.status(400).json({ error: 'uuid, manifest, contextPath required' });

  //validate requester owns the node
  const node = await prisma.node.findFirst({
    where: {
      ownerId: owner.id,
      uuid: uuid.endsWith('.') ? uuid : uuid + '.',
    },
  });
  if (!node) {
    logger.warn(`unauthed node user: ${owner}, node uuid provided: ${uuid}`);
    return res.status(400).json({ error: 'failed' });
  }

  // Uncomment if external CID dags become expandable
  // const isContextExternal = Object.values(externalCidMap).some((extDag) => neutralizePath(extDag.path) === contextPath);

  const cidTypesSizes: Record<string, GetExternalSizeAndTypeResult> = {};
  if (externalCids && externalCids.length) {
    try {
      externalCids = externalCids.map((extCid) => ({ ...extCid, cid: convertToCidV1(extCid.cid) }));
      for (const extCid of externalCids) {
        const { isDirectory, size } = await getExternalCidSizeAndType(extCid.cid);
        if (size !== undefined && isDirectory !== undefined) {
          cidTypesSizes[extCid.cid] = { size, isDirectory };
        } else {
          throw new Error(`Failed to get size and type of external CID: ${extCid}`);
        }
      }
    } catch (e: any) {
      logger.warn(`[UPDATE DAG] External CID Method: ${e}`);
      return res.status(400).json({ error: 'Failed to resolve external CID' });
    }
  }

  //finding rootCid, used for cleanup later
  const manifestCidEntry = node.manifestUrl || node.cid;
  const manifestUrlEntry = manifestCidEntry
    ? cleanupManifestUrl(manifestCidEntry as string, req.query?.g as string)
    : null;

  const fetchedManifestEntry = manifestUrlEntry ? await (await axios.get(manifestUrlEntry)).data : null;
  const latestManifestEntry = fetchedManifestEntry;
  const rootCid = latestManifestEntry.components.find((c) => isNodeRoot(c)).payload.cid;

  const manifestPathsToTypesPrune = generateManifestPathsToDbTypeMap(latestManifestEntry);

  //Pull old tree
  const externalCidMap = await generateExternalCidMap(node.uuid);
  const oldFlatTree = recursiveFlattenTree(await getDirectoryTree(rootCid, externalCidMap)) as RecursiveLsResult[];

  /*
   ** Determine the path of the directory to be updated
   */
  const splitContextPath = contextPath.split('../../');
  splitContextPath.shift();
  //cleanContextPath = how many dags need to be reset, n + 1
  const cleanContextPath = splitContextPath.join('../../');
  logger.debug('[UPDATE DATASET] cleanContextPath: ', cleanContextPath);

  /*
   ** UNIQUENESS CHECK, NO DUPLICATE PATHS
   */
  const OldTreePaths = oldFlatTree.map((e) => e.path);
  let newPathsFormatted: string[] = [];
  const header = !!cleanContextPath ? rootCid + '../../' + cleanContextPath : rootCid;

  if (externalCids?.length && Object.keys(cidTypesSizes)?.length) {
    newPathsFormatted = externalCids.map((extCid) => header + '../../' + extCid.name);
  }

  const hasDuplicates = OldTreePaths.some((oldPath) => newPathsFormatted.includes(oldPath));
  if (hasDuplicates) {
    logger.info('[UPDATE DATASET] Rejected as duplicate paths were found');
    return res.status(400).json({ error: 'Duplicate files rejected' });
  }

  //[EXTERNAL CIDS] If External Cids used, add to uploaded, and add to externalCidMap, also add to externalDagsToPin
  /*
   ** PIN THE DAGS
   */
  let uploaded = [];
  const externalDagsToPin = [];
  if (externalCids?.length && Object.keys(cidTypesSizes)?.length) {
    uploaded = [];
    for await (const extCid of externalCids) {
      const { size, isDirectory } = cidTypesSizes[extCid.cid];

      // if file, may need to omit from being added to extCidMap
      externalCidMap[extCid.cid] = { size, directory: isDirectory, path: extCid.name };
      if (isDirectory) {
        //Get external dag tree, add to external dag pin list
        let tree: RecursiveLsResult[];
        try {
          tree = await pubRecursiveLs(extCid.cid, extCid.name);
        } catch (e) {
          logger.info(
            { extCid },
            '[UPDATE DATASET] External DAG tree resolution failed, the contents within the DAG were unable to be retrieved, rejecting update.',
          );
          return res
            .status(400)
            .json({ error: 'Failed resolving external dag tree, the DAG or its contents were unable to be retrieved' });
        }
        const flatTree = recursiveFlattenTree(tree);
        (flatTree as RecursiveLsResult[]).forEach((file: RecursiveLsResult) => {
          cidTypesSizes[file.cid] = { size: file.size, isDirectory: file.type === 'dir' };
          if (file.type === 'dir') {
            externalDagsToPin.push(file.cid);
            uploaded.push({ path: file.path, cid: file.cid, size: file.size });
            externalCidMap[file.cid] = { size: file.size, directory: file.type === 'dir', path: file.path };
          }
        });
        // debugger;
        externalDagsToPin.push(extCid.cid);
      }
      uploaded.push({
        path: extCid.name,
        cid: extCid.cid,
        size: size,
      });
    }
  }
  //pin exteralDagsToPin
  let externalDagsPinned = [];
  if (externalDagsToPin.length) {
    externalDagsPinned = await pinExternalDags(externalDagsToPin);
  }

  /*
   ** Add files to dag, get new root cid
   */
  //Filtered to first nestings only
  const filteredFiles = uploaded.filter((file) => {
    return file.path.split('../../').length === 1;
  });

  const filesToAddToDag: FilesToAddToDag = {};
  filteredFiles.forEach((file) => {
    filesToAddToDag[file.path] = { cid: file.cid, size: file.size };
  });

  const { updatedRootCid: newRootCidString, updatedDagCidMap } = await addFilesToDag(
    rootCid,
    cleanContextPath,
    filesToAddToDag,
  );
  if (typeof newRootCidString !== 'string') throw Error('DAG extension failed, files already pinned');

  //repull of node required, previous manifestUrl may already be stale
  const ltsNode = await prisma.node.findFirst({
    where: {
      ownerId: owner.id,
      uuid: node.uuid,
    },
  });

  const latestManifestCid = ltsNode.manifestUrl || ltsNode.cid;
  const manifestUrl = latestManifestCid
    ? cleanupManifestUrl(latestManifestCid as string, req.query?.g as string)
    : null;

  // debugger;

  const fetchedManifest = manifestUrl ? await (await axios.get(manifestUrl)).data : null;
  const latestManifest = fetchedManifest;

  const dataBucketId = latestManifest.components.find((c) => isNodeRoot(c)).id;

  let updatedManifest = updateManifestDataBucket({
    manifest: latestManifest,
    newRootCid: newRootCidString,
  });

  //Update all existing DAG components with new CIDs if they were apart of a cascading update
  /*
   ** Might be unnecessary in ext-cid only update
   */
  if (Object.keys(updatedDagCidMap).length) {
    updatedManifest = updateManifestComponentDagCids(updatedManifest, updatedDagCidMap);
  }

  //Only needs to happen if a predefined component type is to be added
  if (componentType) {
    const firstNestingComponents: FirstNestingComponent[] = filteredFiles.map((file) => {
      const neutralFullPath = contextPath + '../../' + file.path;
      const pathSplit = file.path.split('../../');
      const name = pathSplit.pop();
      return {
        name: name,
        path: neutralFullPath,
        cid: file.cid,
        componentType,
        componentSubtype,
        star: true,
      };
    });
    updatedManifest = addComponentsToManifest(updatedManifest, firstNestingComponents);
  }

  logger.debug('ADDING CORRECT TYPES');
  //For adding correct types to the db, when a predefined component type is used
  const newFilePathDbTypeMap = {};
  const externalPathsAdded = {};
  const hasCidTypeSizes = Object.keys(cidTypesSizes)?.length;
  uploaded.forEach((file: IpfsPinnedResult) => {
    const neutralFullPath = contextPath + '../../' + file.path;
    const deneutralizedFullPath = deneutralizePath(neutralFullPath, newRootCidString);
    newFilePathDbTypeMap[deneutralizedFullPath] = ROTypesToPrismaTypes[componentType] || DataType.UNKNOWN;
    if (hasCidTypeSizes) externalPathsAdded[deneutralizedFullPath] = true;
  });

  try {
    //Update refs
    logger.debug('Preparing data refs');

    const newRefs = await prepareDataRefsExternalCids(
      node.uuid,
      updatedManifest,
      newRootCidString,
      false,
      externalCidMap,
    );
    logger.debug('Completed preparing data refs');

    //existing refs
    const existingRefs = await prisma.dataReference.findMany({
      where: {
        nodeId: node.id,
        userId: owner.id,
        type: { not: DataType.MANIFEST },
      },
    });

    // setup refs, matching existing ones with their id, and marking external ones
    const refs = newRefs.map((ref) => {
      // add id's if exists
      const existingRef = existingRefs.find((r) => neutralizePath(r.path) === neutralizePath(ref.path));
      if (existingRef) ref.id = existingRef.id;

      // handle externals (may be needed)
      const extTypeAndSize = externalCidMap[ref.cid];
      if (extTypeAndSize) {
        ref.directory = extTypeAndSize.directory;
        ref.external = true;
      }
      return ref;
    });

    const dataRefCreates = [];
    const dataRefUpdates = refs.filter((ref) => {
      const isUpdate = 'id' in ref;
      if (!isUpdate) dataRefCreates.push(ref);
      return isUpdate;
    });

    const upserts = await prisma.$transaction([
      ...(dataRefUpdates as any).map((fd) => {
        return prisma.dataReference.update({ where: { id: fd.id }, data: fd });
      }),
      prisma.dataReference.createMany({ data: dataRefCreates }),
    ]);
    if (upserts) logger.info(`${upserts.length} new data references added/modified`);

    // //CLEANUP DANGLING REFERENCES//
    oldFlatTree.push({ cid: rootCid, path: rootCid, name: 'Old Root Dir', type: 'dir', size: 0 });

    logger.debug('Before retrieving new tree');

    const flatTree = recursiveFlattenTree(
      await getDirectoryTree(newRootCidString, externalCidMap),
    ) as RecursiveLsResult[];
    flatTree.push({
      name: 'root',
      cid: newRootCidString,
      type: 'dir',
      path: newRootCidString,
      size: 0,
    });

    logger.debug('After retrieving new tree');

    //length should be n + 1, n being nested dirs modified + rootCid
    const pruneList = (oldFlatTree as RecursiveLsResult[]).filter((oldF) => {
      //a path match && a CID difference = prune
      return flatTree.some((newF) => neutralizePath(oldF.path) === neutralizePath(newF.path) && oldF.cid !== newF.cid);
    });

    const formattedPruneList = pruneList.map((e) => {
      const neutralPath = neutralizePath(e.path);
      return {
        description: 'DANGLING DAG, UPDATED DATASET (update v2)',
        cid: e.cid,
        type: inheritComponentType(neutralPath, manifestPathsToTypesPrune) || DataType.UNKNOWN,
        size: 0, //only dags being removed in an update op
        nodeId: node.id,
        userId: owner.id,
        directory: e.type === 'dir' ? true : false,
      };
    });

    const pruneRes = await prisma.cidPruneList.createMany({ data: formattedPruneList });
    logger.info(`[PRUNING] ${pruneRes.count} cidPruneList entries added.`);
    //END OF CLEAN UP//
    const { persistedManifestCid, date } = await persistManifest({ manifest: updatedManifest, node, userId: owner.id });
    if (!persistedManifestCid)
      throw Error(`Failed to persist manifest: ${updatedManifest}, node: ${node}, userId: ${owner.id}`);

    const tree = await getTreeAndFill(updatedManifest, uuid, owner.id);
    return res.status(200).json({
      rootDataCid: newRootCidString,
      manifest: updatedManifest,
      manifestCid: persistedManifestCid,
      tree: tree,
      date: date,
    });
  } catch (e: any) {
    logger.error(`[UPDATE DATASET] error: ${e}`);
    if (uploaded.length || externalDagsPinned.length) {
      logger.error(
        { filesPinned: uploaded, externalDagsPinned },
        `[UPDATE DATASET E:2] CRITICAL! FILES PINNED, DB ADD FAILED`,
      );
      const formattedPruneList = uploaded.map(async (e) => {
        const neutralPath = neutralizePath(e.path);
        return {
          description: '[UPDATE DATASET E:2] FILES PINNED WITH DB ENTRY FAILURE (update v2)',
          cid: e.cid,
          type: inheritComponentType(neutralPath, manifestPathsToTypesPrune) || DataType.UNKNOWN,
          size: e.size || 0,
          nodeId: node.id,
          userId: owner.id,
          directory: await isDir(e.cid),
        };
      });
      externalDagsPinned.forEach((extDagCid) => {
        const extTypeAndSize = externalCidMap[extDagCid];
        formattedPruneList.push({
          description: '[UPDATE DATASET E:2] FILES PINNED WITH DB ENTRY FAILURE (update v2)',
          cid: extDagCid,
          type: DataType.UNKNOWN,
          size: extTypeAndSize?.size || 0,
          nodeId: node.id,
          userId: owner.id,
          directory: extTypeAndSize.directory,
        } as any);
      });
      const prunedEntries = await prisma.cidPruneList.createMany({ data: await Promise.all(formattedPruneList) });
      if (prunedEntries.count) {
        logger.info({ prunedEntries }, `[UPDATE DATASET E:2] ${prunedEntries.count} ADDED FILES TO PRUNE LIST`);
      } else {
        logger.error(`[UPDATE DATASET E:2] failed adding files to prunelist, db may be down`);
      }
    }
    return res.status(400).json({ error: 'failed #1' });
  }

  return res.status(400);
};
