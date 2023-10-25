import {
  DrivePath,
  RecursiveLsResult,
  ResearchObjectComponentSubtypes,
  ResearchObjectComponentType,
  ResearchObjectV1,
  neutralizePath,
  recursiveFlattenTree,
} from '@desci-labs/desci-models';
import { User, Node, DataType } from '@prisma/client';
import axios from 'axios';

import prisma from 'client';
import { persistManifest } from 'controllers/data/utils';
import { cleanupManifestUrl } from 'controllers/nodes';
import parentLogger from 'logger';
import { hasAvailableDataUsageForUpload } from 'services/dataService';
import {
  FilesToAddToDag,
  IpfsDirStructuredInput,
  IpfsPinnedResult,
  addFilesToDag,
  getDirectoryTree,
  isDir,
  pinDirectory,
} from 'services/ipfs';
import { fetchFileStreamFromS3, isS3Configured } from 'services/s3';
import { prepareDataRefs } from 'utils/dataRefTools';
import {
  ExternalCidMap,
  FirstNestingComponent,
  addComponentsToManifest,
  generateExternalCidMap,
  generateManifestPathsToDbTypeMap,
  getTreeAndFill,
  inheritComponentType,
  updateManifestComponentDagCids,
} from 'utils/driveUtils';
import { createDagExtensionFailureError, createDuplicateFileError, createInvalidManifestError, createIpfsUnresolvableError, createIpfsUploadFailureError, createManifestPersistFailError, createMixingExternalDataError, createNotEnoughSpaceError, createUnhandledError } from './processingErrors';

interface ProcessS3DataToIpfsParams {
  files: any[];
  user: User;
  node: Node;
  /**
   * @type {string} path to the directory to be updated
   */
  contextPath: string;
  componentType?: ResearchObjectComponentType;
  componentSubtype?: ResearchObjectComponentSubtypes;
}

const logger = parentLogger.child({
  module: 'Services::Processing',
});

/**
 * Proccesses regular file uploads, pins S3 files to IPFS, adds them to the end of the context DAG node, creates data references for them and updates the manifest.
 */
export async function processS3DataToIpfs({
  files,
  user,
  node,
  contextPath,
  componentType,
  componentSubtype,
}: ProcessS3DataToIpfsParams) {
  let pinResult: IpfsPinnedResult[] = [];
  let manifestPathsToTypesPrune: Record<DrivePath, DataType> = {};
  try {
    ensureSpaceAvailable(files, user);

    const { manifest, manifestCid } = await getManifestFromNode(node);
    const rootCid = extractRootDagCidFromManifest(manifest, manifestCid);
    manifestPathsToTypesPrune = generateManifestPathsToDbTypeMap(manifest);

    // Pull old tree
    const externalCidMap = await generateExternalCidMap(node.uuid);
    const oldFlatTree = recursiveFlattenTree(await getDirectoryTree(rootCid, externalCidMap)) as RecursiveLsResult[];
    oldFlatTree.push({ cid: rootCid, path: rootCid, name: 'Old Root Dir', type: 'dir', size: 0 });
    // Map paths=>branch for constant lookup
    const oldTreePathsMap: Record<DrivePath, RecursiveLsResult> = oldFlatTree.reduce((map, branch) => {
      // branch.path would still be deneutralized path, change if ever becomes necessary.
      // i.e. branch.path === '/bafkrootcid/images/node.png' rather than '/root/images/node.png'
      map[neutralizePath(branch.path)] = branch;
      return map;
    }, {});

    // External dir check
    pathContainsExternalCids(oldTreePathsMap, contextPath);

    const splitContextPath = contextPath.split('/');
    splitContextPath.shift();
    //rootlessContextPath = how many dags need to be reset, n + 1, used for addToDag function
    const rootlessContextPath = splitContextPath.join('/');

    // Check if paths are unique
    ensureUniquePaths(oldTreePathsMap, contextPath, files);

    // Pin new files, structure for DAG extension, add to DAG
    pinResult = await pinNewFiles(files);
    const { filesToAddToDag, filteredFiles } = filterFirstNestings(pinResult);
    const { updatedRootCid: newRootCidString, updatedDagCidMap } = await addFilesToDag(
      rootCid,
      rootlessContextPath,
      filesToAddToDag,
    );
    if (typeof newRootCidString !== 'string') throw createDagExtensionFailureError;

    /**
     * Repull latest node, to avoid stale manifest that may of been modified since last pull
     * lts = latest in this context, onwards
     * */
    const ltsNode = await prisma.node.findFirst({
      where: {
        ownerId: user.id,
        uuid: node.uuid,
      },
    });

    const { manifest: ltsManifest, manifestCid: ltsManifestCid } = await getManifestFromNode(ltsNode);
    let updatedManifest = updateManifestDataBucket({
      manifest: ltsManifest,
      newRootCid: newRootCidString,
    });

    //Update all existing DAG components with new CIDs if they were apart of a cascading update
    if (Object.keys(updatedDagCidMap).length) {
      updatedManifest = updateManifestComponentDagCids(updatedManifest, updatedDagCidMap);
    }

    if (componentType) {
      /**
       * Automatically create a new component(s) for the files added, to the first nesting.
       * It doesn't need to create a new component for every file, only the first nested ones, as inheritance takes care of the children files.
       * Only needs to happen if a predefined component type is to be added
       */
      const firstNestingComponents = predefineComponentsForPinnedFiles({
        pinnedFirstNestingFiles: filteredFiles,
        contextPath,
        componentType,
        componentSubtype,
      });
      updatedManifest = addComponentsToManifest(updatedManifest, firstNestingComponents);
    }

    // Update existing data references, add new data references.
    const upserts = await updateDataReferences({ node, user, updatedManifest, newRootCidString, externalCidMap });
    if (upserts) logger.info(`${upserts.length} new data references added/modified`);

    // Cleanup, add old DAGs to prune list
    const pruneRes = await cleanupDanglingRefs({
      newRootCidString,
      externalCidMap,
      oldTreePathsMap: oldTreePathsMap,
      manifestPathsToDbComponentTypesMap: manifestPathsToTypesPrune,
      node,
      user,
    });
    logger.info(`[PRUNING] ${pruneRes.count} cidPruneList entries added.`);

    // Persist updated manifest, (pin, update Node DB entry)
    const { persistedManifestCid, date } = await persistManifest({ manifest: updatedManifest, node, userId: user.id });
    if (!persistedManifestCid)
      throw createManifestPersistFailError(`Failed to persist manifest: ${updatedManifest}, node: ${node}, userId: ${user.id}`);

    const tree = await getTreeAndFill(updatedManifest, node.uuid, user.id);

    return {
      rootDataCid: newRootCidString,
      manifest: updatedManifest,
      manifestCid: persistedManifestCid,
      tree: tree,
      date: date,
    };
    // SUCCESS
  } catch (error) {
    // DB status to failed
    // Socket emit to client
    logger.error({error}, 'Error processing S3 data to IPFS');
    if (pinResult.length) {
      handleCleanupOnMidProcessingError({
        pinnedFiles: pinResult,
        manifestPathsToDbComponentTypesMap: manifestPathsToTypesPrune,
        node,
        user,
      });
    }
    const controlledErr = 'type' in error ? error : createUnhandledError(error)
    throw controlledErr;
  }
}

export async function ensureSpaceAvailable(files: any[], user: User) {
  let uploadSizeBytes = 0;
  if (files.length) files.forEach((f) => (uploadSizeBytes += f.size));
  // if (externalUrl) uploadSizeBytes += externalUrlTotalSizeBytes;
  const hasStorageSpaceToUpload = await hasAvailableDataUsageForUpload(user, { fileSizeBytes: uploadSizeBytes });
  if (!hasStorageSpaceToUpload)
    throw createNotEnoughSpaceError(
      `upload size of ${uploadSizeBytes} exceeds users data budget of ${user.currentDriveStorageLimitGb} GB`,
    );
  return true;
}

export function extractRootDagCidFromManifest(manifest: ResearchObjectV1, manifestCid: string) {
  const rootCid: string = manifest.components.find((c) => c.type === ResearchObjectComponentType.DATA_BUCKET).payload
    .cid;
  if (!rootCid) throw createInvalidManifestError(`Root DAG not found in manifest, manifestCid: ${manifestCid}`);
  return rootCid;
}

export async function getManifestFromNode(
  node: Node,
  queryString?: string,
): Promise<{ manifest: ResearchObjectV1; manifestCid: string }> {
  const manifestCid = node.manifestUrl || node.cid;
  const manifestUrlEntry = manifestCid ? cleanupManifestUrl(manifestCid as string, queryString as string) : null;

  const fetchedManifest = manifestUrlEntry ? await (await axios.get(manifestUrlEntry)).data : null;
  if (!fetchedManifest) throw createIpfsUnresolvableError(`Error fetching manifest from IPFS, manifestCid: ${manifestCid}`);
  return { manifest: fetchedManifest, manifestCid };
}

export function pathContainsExternalCids(flatTreeMap: Record<DrivePath, RecursiveLsResult>, contextPath: string) {
  // Check if update path contains externals, disable adding to external DAGs
  const pathMatch = flatTreeMap[contextPath];
  if (pathMatch?.external) throw createMixingExternalDataError();
  return false;
}

export function ensureUniquePaths(
  flatTreeMap: Record<DrivePath, RecursiveLsResult>,
  contextPath: string,
  filesBeingAdded: any[],
): boolean {
  // ensure all paths are unique to prevent borking datasets, reject if fails unique check

  let newPathsFormatted: string[] = [];
  const header = contextPath;
  if (filesBeingAdded.length) {
    newPathsFormatted = filesBeingAdded.map((f) => {
      if (f.originalname[0] !== '/') f.originalname = '/' + f.originalname;
      return header + f.originalname;
    });
  }
  // if (externalUrl) {
  //   if (externalUrlFiles?.length > 0) {
  //     newPathsFormatted = externalUrlFiles.map((f) => {
  //       return header + '/' + f.path;
  //     });
  //   }

  // Code repo, add repo dir path
  //   if (zipPath.length > 0) {
  //     newPathsFormatted = [header + '/' + externalUrl.path];
  //   } else {
  //   }
  // }

  // if (newFolderName) {
  //   newPathsFormatted = [header + '/' + newFolderName];
  // }
  const hasDuplicates = newPathsFormatted.some((newPath) => newPath in flatTreeMap);
  if (hasDuplicates) {
    logger.info('[UPDATE DATASET] Rejected as duplicate paths were found');
    throw createDuplicateFileError();
  }
  return true;
}

export async function pinNewFiles(files: any[]): Promise<IpfsPinnedResult[]> {
  const structuredFilesForPinning: IpfsDirStructuredInput[] = await Promise.all(
    files.map(async (f: any) => {
      if (isS3Configured) {
        const fileStream = await fetchFileStreamFromS3(f.key);
        return { path: f.originalname, content: fileStream };
      }
      return { path: f.originalname, content: f.buffer };
    }),
  );
  let uploaded: IpfsPinnedResult[];
  if (structuredFilesForPinning.length) {
    if (structuredFilesForPinning.length) uploaded = await pinDirectory(structuredFilesForPinning);
    if (!uploaded.length) throw createIpfsUploadFailureError();
    logger.info('[UPDATE DATASET] Pinned files: ', uploaded.length);
  }
  return uploaded;
}

/**
 * Useful for filtering for the files that need to be added to the end of a DAG node.
 * @returns {FilesToAddToDag} an object structured ready to add to the end of a DAG node.
 * @returns {FilteredFiles} the resulting array of files that need to be added to the end of a DAG node.
 * @example
 * ['/readme.md', '/data', 'data/file1.txt'], given this array of files pinned, only the first two elements should be added to the end of a DAG node.
 */
export function filterFirstNestings(pinResult: IpfsPinnedResult[]): {
  filesToAddToDag: FilesToAddToDag;
  filteredFiles: IpfsPinnedResult[];
} {
  const filteredFiles = pinResult.filter((file) => {
    return file.path.split('/').length === 1;
  });

  const filesToAddToDag: FilesToAddToDag = {};
  filteredFiles.forEach((file) => {
    filesToAddToDag[file.path] = { cid: file.cid, size: file.size };
  });
  return { filesToAddToDag, filteredFiles };
}

interface UpdatingManifestParams {
  manifest: ResearchObjectV1;
  newRootCid: string;
}

export function updateManifestDataBucket({ manifest, newRootCid }: UpdatingManifestParams): ResearchObjectV1 {
  const componentIndex = manifest.components.findIndex((c) => c.type === ResearchObjectComponentType.DATA_BUCKET);
  manifest.components[componentIndex] = {
    ...manifest.components[componentIndex],
    payload: {
      ...manifest.components[componentIndex].payload,
      cid: newRootCid,
    },
  };

  return manifest;
}

interface PredefineComponentsForPinnedFilesParams {
  pinnedFirstNestingFiles: IpfsPinnedResult[];
  contextPath: string;
  componentType: ResearchObjectComponentType;
  componentSubtype?: ResearchObjectComponentSubtypes;
  externalUrl?: { url: string; path: string };
}

/**
 * Create a new component(s) for the files passed in, ~~these components are starred by default~~.
 */
export function predefineComponentsForPinnedFiles({
  pinnedFirstNestingFiles,
  contextPath,
  componentType,
  componentSubtype,
  externalUrl,
}: PredefineComponentsForPinnedFilesParams): FirstNestingComponent[] {
  const firstNestingComponents: FirstNestingComponent[] = pinnedFirstNestingFiles.map((file) => {
    const neutralFullPath = contextPath + '/' + file.path;
    const pathSplit = file.path.split('/');
    const name = pathSplit.pop();
    return {
      name: name,
      path: neutralFullPath,
      cid: file.cid,
      componentType,
      componentSubtype,
      // star: true, // removed; starring by default was unpopular
      ...(externalUrl && { externalUrl: externalUrl.url }),
    };
  });
  return firstNestingComponents;
}

interface UpdateDataReferencesParams {
  node: Node;
  user: User;
  updatedManifest: ResearchObjectV1;
  newRootCidString: string;
  externalCidMap: ExternalCidMap;
}
export async function updateDataReferences({
  node,
  user,
  updatedManifest,
  newRootCidString,
  externalCidMap,
}: UpdateDataReferencesParams) {
  const newRefs = await prepareDataRefs(node.uuid, updatedManifest, newRootCidString, false, externalCidMap);

  // Get old refs to match their DB entry id's with the updated refs
  const existingRefs = await prisma.dataReference.findMany({
    where: {
      nodeId: node.id,
      userId: user.id,
      type: { not: DataType.MANIFEST },
    },
  });
  // Map existing ref neutral paths to the ref for constant lookup
  const existingRefMap = existingRefs.reduce((map, ref) => {
    map[neutralizePath(ref.path)] = ref;
    return map;
  }, {});

  const dataRefCreates = [];
  const dataRefUpdates = [];
  // setup refs, matching existing ones with their id, distinguish between update ops and create ops
  newRefs.forEach((ref) => {
    const newRefNeutralPath = neutralizePath(ref.path);
    const matchingExistingRef = existingRefMap[newRefNeutralPath];
    if (matchingExistingRef) {
      dataRefUpdates.push({ ...matchingExistingRef, ...ref });
    } else {
      dataRefCreates.push(ref);
    }
  });

  const upserts = await prisma.$transaction([
    ...(dataRefUpdates as any).map((fd) => {
      return prisma.dataReference.update({ where: { id: fd.id }, data: fd });
    }),
    prisma.dataReference.createMany({ data: dataRefCreates }),
  ]);
  return upserts;
}

interface CleanupDanglingReferencesParams {
  node: Node;
  user: User;
  newRootCidString: string;
  externalCidMap: ExternalCidMap;
  oldTreePathsMap: Record<DrivePath, RecursiveLsResult>;
  manifestPathsToDbComponentTypesMap: Record<DrivePath, DataType>;
}

/**
 * When a DAG is updated, it's possible that some DAGS & data references are no longer valid, this function will remove them.
 * @example If a file 'xray.png' is added to '/root/medical_imging/', both the 'root' and 'medical_imging' DAGs would be updated,
 *  and their CIDs accordingly, the old CIDs should be added to the prune list.
 * @example In a DELETE operation, the file/folder being deleted would be added to the prune list, and their references removed.
 * TODO: If this function ends up being used in DELETE operations, fix the size in formattedPruneList within this function
 */
export async function cleanupDanglingRefs({
  newRootCidString,
  externalCidMap,
  oldTreePathsMap,
  manifestPathsToDbComponentTypesMap,
  node,
  user,
}: CleanupDanglingReferencesParams) {
  // //CLEANUP DANGLING REFERENCES//

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

  const pruneList = [];
  // Below looks for a DAG with the same path, but a changed CID, meaning the DAG was updated, and we have to prune the old one.
  // length should be n + 1, n being nested dirs modified + rootCid
  // a path match && a CID difference = prune
  flatTree.forEach((newFd) => {
    if (newFd.path in oldTreePathsMap) {
      const oldFd = oldTreePathsMap[newFd.path];
      if (oldFd.cid !== newFd.cid) {
        pruneList.push(oldFd);
      }
    }
  });

  const formattedPruneList = pruneList.map((e) => {
    const neutralPath = neutralizePath(e.path);
    return {
      description: 'DANGLING DAG, UPDATED DATASET (update v2)',
      cid: e.cid,
      type: inheritComponentType(neutralPath, manifestPathsToDbComponentTypesMap) || DataType.UNKNOWN,
      size: 0, //only dags being removed in an update op, change if this func used in delete.
      nodeId: node.id,
      userId: user.id,
      directory: e.type === 'dir' ? true : false,
    };
  });

  const pruneRes = await prisma.cidPruneList.createMany({ data: formattedPruneList });
  return pruneRes;
}

interface HandleCleanupOnMidProcessingErrorParams {
  node: Node;
  user: User;
  pinnedFiles: IpfsPinnedResult[];
  manifestPathsToDbComponentTypesMap: Record<DrivePath, DataType>;
}

/**
 * If files were already pinned and a failure later occured before data references were added, they need to be cleaned up.
 */
export async function handleCleanupOnMidProcessingError({
  pinnedFiles,
  manifestPathsToDbComponentTypesMap,
  node,
  user,
}: HandleCleanupOnMidProcessingErrorParams) {
  // If more than 30 files were pinned, only show the last 10, to not overload the logs with a large entry.
  // All pinned files will be added to the prune list table regardless.
  let last10Pinned = pinnedFiles;
  const pinnedFilesCount = pinnedFiles.length;
  if (pinnedFilesCount > 30) {
    last10Pinned = pinnedFiles.slice(pinnedFilesCount - 10, pinnedFilesCount);
  }

  logger.error(
    { pinnedFilesCount, last10Pinned },
    `[UPDATE DATASET E:2] CRITICAL! FILES PINNED, DB ADD FAILED, total files pinned: ${pinnedFilesCount}`,
  );
  const formattedPruneList = pinnedFiles.map(async (e) => {
    const neutralPath = neutralizePath(e.path);
    return {
      description: '[UPDATE DATASET E:2] FILES PINNED WITH DB ENTRY FAILURE (update v2)',
      cid: e.cid,
      type: inheritComponentType(neutralPath, manifestPathsToDbComponentTypesMap) || DataType.UNKNOWN,
      size: e.size || 0,
      nodeId: node.id,
      userId: user.id,
      directory: await isDir(e.cid),
    };
  });
  const prunedEntries = await prisma.cidPruneList.createMany({ data: await Promise.all(formattedPruneList) });
  if (prunedEntries.count) {
    logger.info(
      { prunedEntriesCreated: prunedEntries.count },
      `[UPDATE DATASET E:2] ${prunedEntries.count} ADDED FILES TO PRUNE LIST`,
    );
  } else {
    logger.fatal(
      { pinnedFiles },
      `[UPDATE DATASET E:2] failed adding files to prunelist, db may be down, this is critical, files were pinned but not added to the DB`,
    );
    // In this case, we log the files just incase, no matter how many.
  }
}
