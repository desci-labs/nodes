import {
  neutralizePath,
  deneutralizePath,
  recursiveFlattenTree,
  ResearchObjectComponentType,
  ResearchObjectV1,
  DriveObject,
  FileDir,
} from '@desci-labs/desci-models';
import { DataType, User } from '@prisma/client';
import axios from 'axios';
import { Request, Response } from 'express';

import prisma from 'client';
import { cleanupManifestUrl } from 'controllers/nodes';
import parentLogger from 'logger';
import { hasAvailableDataUsageForUpload } from 'services/dataService';
import {
  addFilesToDag,
  convertToCidV1,
  FilesToAddToDag,
  getDirectoryTree,
  getExternalCidSizeAndType,
  GetExternalSizeAndTypeResult,
  IpfsDirStructuredInput,
  IpfsPinnedResult,
  isDir,
  pinDirectory,
  pinExternalDags,
  pubRecursiveLs,
  RecursiveLsResult,
  zipToPinFormat,
} from 'services/ipfs';
import { arrayXor, processExternalUrls, zipUrlToBuffer } from 'utils';
import { prepareDataRefs } from 'utils/dataRefTools';
import {
  FirstNestingComponent,
  ROTypesToPrismaTypes,
  addComponentsToManifest,
  generateExternalCidMap,
  generateManifestPathsToDbTypeMap,
  getTreeAndFill,
  inheritComponentType,
  updateManifestComponentDagCids,
} from 'utils/driveUtils';

import { persistManifest } from './utils';

interface UpdatingManifestParams {
  manifest: ResearchObjectV1;
  dataBucketId: string;
  newRootCid: string;
}

export function updateManifestDataBucket({ manifest, dataBucketId, newRootCid }: UpdatingManifestParams) {
  const componentIndex = manifest.components.findIndex((c) => c.id === dataBucketId);
  manifest.components[componentIndex] = {
    ...manifest.components[componentIndex],
    payload: {
      ...manifest.components[componentIndex].payload,
      cid: newRootCid,
    },
  };

  return manifest;
}

interface UpdateResponse {
  status?: number;
  rootDataCid: string;
  manifest: ResearchObjectV1;
  manifestCid: string;
  tree: DriveObject[];
  date: string;
}

export interface ErrorResponse {
  error: string;
  status?: number;
}

export const update = async (req: Request, res: Response<UpdateResponse | ErrorResponse | string>) => {
  const owner = (req as any).user as User;
  const { uuid, manifest, contextPath, componentType, componentSubtype, newFolderName } = req.body;
  let { externalUrl, externalCids } = req.body;
  //Require XOR (files, externalCid, externalUrl, newFolder)
  //ExternalURL - url + type, code (github) & external pdfs for now
  //v0 ExternalCids - cids + type (data for now), no pinning
  const logger = parentLogger.child({
    // id: req.id,
    module: 'DATA::UpdateController',
    userId: owner.id,
    uuid: uuid,
    manifest: manifest,
    contextPath: contextPath,
    componentType: componentType,
    componentSubtype,
    newFolderName,
    externalUrl,
    externalCids,
    files: req.files,
  });
  logger.trace(`[UPDATE DATASET] Updating in context: ${contextPath}`);
  if (uuid === undefined || manifest === undefined || contextPath === undefined)
    return res.status(400).json({ error: 'uuid, manifest, contextPath required' });
  const manifestObj: ResearchObjectV1 = JSON.parse(manifest);
  if (externalUrl) externalUrl = JSON.parse(externalUrl);
  if (externalCids) externalCids = JSON.parse(externalCids);
  let uploaded: IpfsPinnedResult[];

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

  const files = req.files as Express.Multer.File[];
  if (!arrayXor([externalUrl, files.length, externalCids?.length, newFolderName?.length]))
    return res
      .status(400)
      .json({ error: 'Choose between one of the following; files, new folder, externalUrl or externalCids' });

  /*
   ** External URL setup, currnetly used for Github Code Repositories & external PDFs
   */
  let externalUrlFiles: IpfsDirStructuredInput[];
  let externalUrlTotalSizeBytes: number;
  if (
    (externalUrl &&
      externalUrl?.path?.length &&
      externalUrl?.url?.length &&
      componentType === ResearchObjectComponentType.CODE) ||
    (externalUrl && externalUrl?.url?.length && componentType === ResearchObjectComponentType.PDF)
  ) {
    try {
      // External URL code, only supports github for now
      if (componentType === ResearchObjectComponentType.CODE) {
        const processedUrl = await processExternalUrls(externalUrl.url, componentType);
        const zipBuffer = await zipUrlToBuffer(processedUrl);
        const { files, totalSize } = await zipToPinFormat(zipBuffer, externalUrl.path);
        externalUrlFiles = files;
        externalUrlTotalSizeBytes = totalSize;
      }
      // External URL pdf
      if (componentType === ResearchObjectComponentType.PDF) {
        const url = externalUrl.url;
        const res = await axios.get(url, { responseType: 'arraybuffer' });
        const buffer = Buffer.from(res.data, 'binary');
        externalUrlFiles = [{ path: externalUrl.path, content: buffer }];
        externalUrlTotalSizeBytes = buffer.length;
      }
    } catch (e) {
      logger.warn(
        `[UPDATE DAG] Error: External URL method: ${e}, url provided: ${externalUrl?.url}, path: ${externalUrl?.path}`,
      );
      return res.status(500).send('[UPDATE DAG]Error fetching content from external link.');
    }
  }

  /*
   ** External CID setup
   */
  const cidTypesSizes: Record<string, GetExternalSizeAndTypeResult> = {};
  if (externalCids && externalCids.length && componentType === ResearchObjectComponentType.DATA) {
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

  //finding rootCid
  const manifestCidEntry = node.manifestUrl || node.cid;
  const manifestUrlEntry = manifestCidEntry
    ? cleanupManifestUrl(manifestCidEntry as string, req.query?.g as string)
    : null;

  const fetchedManifestEntry = manifestUrlEntry ? await (await axios.get(manifestUrlEntry)).data : null;
  const latestManifestEntry = fetchedManifestEntry || manifestObj;
  const rootCid = latestManifestEntry.components.find((c) => c.type === ResearchObjectComponentType.DATA_BUCKET).payload
    .cid;

  const manifestPathsToTypesPrune = generateManifestPathsToDbTypeMap(latestManifestEntry);

  /*
   ** Check if user has enough storage space to upload
   */
  let uploadSizeBytes = 0;
  if (files.length) files.forEach((f) => (uploadSizeBytes += f.size));
  if (externalUrl) uploadSizeBytes += externalUrlTotalSizeBytes;
  const hasStorageSpaceToUpload = await hasAvailableDataUsageForUpload(owner, { fileSizeBytes: uploadSizeBytes });
  if (!hasStorageSpaceToUpload)
    return res.status(400).json({
      error: `upload size of ${uploadSizeBytes} exceeds users data budget of ${owner.currentDriveStorageLimitGb} GB`,
    });

  //Pull old tree
  const externalCidMap = await generateExternalCidMap(node.uuid);
  const oldFlatTree = recursiveFlattenTree(await getDirectoryTree(rootCid, externalCidMap)) as RecursiveLsResult[];

  /*
   ** Check if update path contains externals, temporarily disable adding to external DAGs
   */
  const pathMatch = (oldFlatTree as RecursiveLsResult[]).find((c) => {
    const neutralPath = neutralizePath(c.path);
    return neutralPath === contextPath;
  });
  if (pathMatch?.external) return res.status(400).json({ error: 'Cannot update externally added directories' });

  /*
   ** Determine the path of the directory to be updated
   */
  const splitContextPath = contextPath.split('/');
  splitContextPath.shift();
  //cleanContextPath = how many dags need to be reset, n + 1
  const cleanContextPath = splitContextPath.join('/');
  logger.debug('[UPDATE DATASET] cleanContextPath: ', cleanContextPath);

  //ensure all paths are unique to prevent borking datasets, reject if fails unique check
  // debugger;
  const OldTreePaths = oldFlatTree.map((e) => e.path);
  let newPathsFormatted: string[] = [];
  const header = !!cleanContextPath ? rootCid + '/' + cleanContextPath : rootCid;
  if (files.length) {
    newPathsFormatted = files.map((f) => {
      if (f.originalname[0] !== '/') f.originalname = '/' + f.originalname;
      return header + f.originalname;
    });
  }
  if (externalUrl) {
    newPathsFormatted = externalUrlFiles.map((f) => {
      return header + '/' + f.path;
    });
  }

  if (newFolderName) {
    newPathsFormatted = [header + '/' + newFolderName];
  }

  if (externalCids?.length && Object.keys(cidTypesSizes)?.length) {
    newPathsFormatted = externalCids.map((extCid) => header + '/' + extCid.name);
  }

  const hasDuplicates = OldTreePaths.some((oldPath) => newPathsFormatted.includes(oldPath));
  if (hasDuplicates) {
    logger.info('[UPDATE DATASET] Rejected as duplicate paths were found');
    return res.status(400).json({ error: 'Duplicate files rejected' });
  }

  //[EXTERNAL CIDS] If External Cids used, add to uploaded, and add to externalCidMap, also add to externalDagsToPin
  const externalDagsToPin = [];
  if (externalCids?.length && Object.keys(cidTypesSizes)?.length) {
    uploaded = [];
    for await (const extCid of externalCids) {
      const { size, isDirectory } = cidTypesSizes[extCid.cid];
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
          res
            .status(400)
            .json({ error: 'Failed resolving external dag tree, the DAG or its contents were unable to be retrieved' });
        }
        const flatTree = recursiveFlattenTree(tree);
        (flatTree as RecursiveLsResult[]).forEach((file: RecursiveLsResult) => {
          cidTypesSizes[file.cid] = { size: file.size, isDirectory: file.type === 'dir' };
          if (file.type === 'dir') externalDagsToPin.push(file.cid);
          uploaded.push({ path: file.path, cid: file.cid, size: file.size });
          externalCidMap[file.cid] = { size: file.size, directory: file.type === 'dir', path: file.path };
        });
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
  //Pin the new files
  const structuredFilesForPinning: IpfsDirStructuredInput[] = files.map((f: any) => {
    return { path: f.originalname, content: f.buffer };
  });

  if (structuredFilesForPinning.length || externalUrlFiles?.length) {
    const filesToPin = structuredFilesForPinning.length ? structuredFilesForPinning : externalUrlFiles;
    if (filesToPin.length) uploaded = await pinDirectory(filesToPin);
    if (!uploaded.length) res.status(400).json({ error: 'Failed uploading to ipfs' });
    logger.info('[UPDATE DATASET] Pinned files: ', uploaded);
  }

  //New folder creation, add to uploaded
  if (newFolderName) {
    const newFolder = await pinDirectory([{ path: newFolderName + '/.nodeKeep', content: Buffer.from('') }]);
    if (!newFolder.length) res.status(400).json({ error: 'Failed creating new folder' });
    uploaded = newFolder;
  }

  /*
   ** Add files to dag, get new root cid
   */
  //Filtered to first nestings only
  const filteredFiles = uploaded.filter((file) => {
    return file.path.split('/').length === 1;
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

  const fetchedManifest = manifestUrl ? await (await axios.get(manifestUrl)).data : null;
  const latestManifest = fetchedManifest || manifestObj;

  const dataBucketId = latestManifest.components.find((c) => c.type === ResearchObjectComponentType.DATA_BUCKET).id;

  let updatedManifest = updateManifestDataBucket({
    manifest: latestManifest,
    dataBucketId: dataBucketId,
    newRootCid: newRootCidString,
  });

  //Update all existing DAG components with new CIDs if they were apart of a cascading update
  if (Object.keys(updatedDagCidMap).length) {
    updatedManifest = updateManifestComponentDagCids(updatedManifest, updatedDagCidMap);
  }

  //Only needs to happen if a predefined component type is to be added
  if (componentType) {
    const firstNestingComponents: FirstNestingComponent[] = filteredFiles.map((file) => {
      const neutralFullPath = contextPath + '/' + file.path;
      const pathSplit = file.path.split('/');
      const name = pathSplit.pop();
      return {
        name: name,
        path: neutralFullPath,
        cid: file.cid,
        componentType,
        componentSubtype,
        star: true,
        ...(externalUrl && { externalUrl: externalUrl.url }),
      };
    });
    updatedManifest = addComponentsToManifest(updatedManifest, firstNestingComponents);
  }

  //For adding correct types to the db, when a predefined component type is used
  const newFilePathDbTypeMap = {};
  const externalPathsAdded = {};
  uploaded.forEach((file: IpfsPinnedResult) => {
    const neutralFullPath = contextPath + '/' + file.path;
    const deneutralizedFullPath = deneutralizePath(neutralFullPath, newRootCidString);
    newFilePathDbTypeMap[deneutralizedFullPath] = ROTypesToPrismaTypes[componentType] || DataType.UNKNOWN;
    if (Object.keys(cidTypesSizes)?.length) externalPathsAdded[deneutralizedFullPath] = true;
  });

  try {
    //Update refs
    const newRefs = await prepareDataRefs(node.uuid, updatedManifest, newRootCidString, false, externalCidMap);

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
          size: extTypeAndSize.size || 0,
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
};
