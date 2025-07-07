import { DocumentId } from '@automerge/automerge-repo';
import {
  DEFAULT_COMPONENT_TYPE,
  DrivePath,
  RecursiveLsResult,
  ResearchObjectComponentSubtypes,
  ResearchObjectComponentType,
  ResearchObjectComponentTypeMap,
  ResearchObjectV1,
  extractComponentTypeFromTypeMap,
  extractExtension,
  isNodeRoot,
  neutralizePath,
  recursiveFlattenTree,
} from '@desci-labs/desci-models';
import { User, Node, DataType, Prisma } from '@prisma/client';
import axios from 'axios';
import { CID } from 'multiformats';
import { v4 } from 'uuid';

import { prisma } from '../../client.js';
import { UpdateResponse } from '../../controllers/data/update.js';
import { persistManifest } from '../../controllers/data/utils.js';
import { logger as parentLogger } from '../../logger.js';
import { getFromCache, redisClient, setToCache } from '../../redisClient.js';
import { hasAvailableDataUsageForUpload } from '../../services/dataService.js';
import { ensureUniquePathsDraftTree, externalDirCheck, getLatestDriveTime } from '../../services/draftTrees.js';
import {
  FilesToAddToDag,
  IPFS_NODE,
  IpfsDirStructuredInput,
  IpfsPinnedResult,
  getDirectoryTree,
  getNodeToUse,
  isDir,
  pinDirectory,
} from '../../services/ipfs.js';
import { fetchFileStreamFromS3, isS3Configured } from '../../services/s3.js';
import { ResearchObjectDocument } from '../../types/documents.js';
import { attachLoggedData, prepareDataRefsForDraftTrees } from '../../utils/dataRefTools.js';
import { DRAFT_CID, DRAFT_DIR_CID, ipfsDagToDraftNodeTreeEntries } from '../../utils/draftTreeUtils.js';
import {
  ExtensionDataTypeMap,
  ExternalCidMap,
  FirstNestingComponent,
  generateManifestPathsToDbTypeMap,
  getTreeAndFill,
  inheritComponentType,
  prepareFirstNestingComponents,
} from '../../utils/driveUtils.js';
import { EXTENSION_MAP } from '../../utils/extensions.js';
import { cleanupManifestUrl } from '../../utils/manifest.js';
import { NodeUuid, getLatestManifestFromNode } from '../manifestRepo.js';
import repoService from '../repoService.js';

import {
  Either,
  ProcessingError,
  createDuplicateFileError,
  createGuestFileSizeLimitError,
  createInvalidManifestError,
  createIpfsUnresolvableError,
  createIpfsUploadFailureError,
  createManifestPersistFailError,
  createMixingExternalDataError,
  createNotEnoughSpaceError,
  createUnhandledError,
} from './processingErrors.js';

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
  autoStar?: boolean;
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
  autoStar,
}: ProcessS3DataToIpfsParams): Promise<Either<UpdateResponse, ProcessingError>> {
  let pinResult: IpfsPinnedResult[] = [];
  let manifestPathsToTypesPrune: Record<DrivePath, DataType | ExtensionDataTypeMap> = {};
  if (contextPath.endsWith('/')) contextPath = contextPath.slice(0, -1);
  try {
    await ensureSpaceAvailable(files, user);
    await guestFileSizeLimitCheck(files, user);
    const manifest = await getLatestManifestFromNode(node);
    manifestPathsToTypesPrune = generateManifestPathsToDbTypeMap(manifest);
    const componentTypeMap: ResearchObjectComponentTypeMap = constructComponentTypeMapFromFiles(files);

    // External dir check
    await externalDirCheck(node.id, contextPath);

    // Check if paths are unique
    await ensureUniquePathsDraftTree({ nodeId: node.id, contextPath, filesBeingAdded: files });

    // Pin new files, add draftNodeTree entries
    pinResult = await pinNewFiles(files, { wrapWithDirectory: true, ipfsNode: getNodeToUse(user.isGuest) });
    if (pinResult) {
      const root = pinResult[pinResult.length - 1];
      const rootTree = (await getDirectoryTree(
        root.cid,
        {},
        {
          ipfsNode: getNodeToUse(user.isGuest),
        },
      )) as RecursiveLsResult[];

      const draftNodeTreeEntries: Prisma.DraftNodeTreeCreateManyInput[] = ipfsDagToDraftNodeTreeEntries({
        ipfsTree: rootTree,
        node,
        user,
        contextPath,
      });
      const addedEntries = await prisma.draftNodeTree.createMany({
        data: draftNodeTreeEntries,
        skipDuplicates: true,
      });
      logger.info(`Successfully added ${addedEntries.count} entries to DraftNodeTree`);
    }

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

    // const ltsManifest = await getLatestManifestFromNode(ltsNode);
    let updatedManifest = await repoService.getDraftManifest({
      uuid: ltsNode.uuid as NodeUuid,
      documentId: ltsNode.manifestDocumentId,
    });

    const { filteredFiles } = filterFirstNestings(pinResult.slice(0, -1));

    if (componentTypeMap) {
      /**
       * Automatically create a new component(s) for the files added, to the first nesting.
       * It doesn't need to create a new component for every file, only the first nested ones, as inheritance takes care of the children files.
       * Only needs to happen if a predefined component type is to be added
       */
      if (autoStar) {
        const firstNestingComponents = predefineComponentsForPinnedFiles({
          pinnedFirstNestingFiles: filteredFiles,
          contextPath,
          componentTypeMap,
          star: true,
        });
        const preparedComponents = prepareFirstNestingComponents(firstNestingComponents);

        const updatedDoc = await repoService.dispatchAction({
          uuid: node.uuid as NodeUuid,
          documentId: node.manifestDocumentId as DocumentId,
          actions: [
            {
              type: 'Upsert Components',
              components: preparedComponents,
            },
          ],
        });
        updatedManifest = updatedDoc.manifest;
      }

      updatedManifest = await assignTypeMapInManifest(node, updatedManifest, componentTypeMap, contextPath, DRAFT_CID);
      logger.info({ updatedManifest }, 'assignTypeMapInManifest');
    }

    const upserts = await updateDataReferences({ node, user, updatedManifest });
    if (upserts) logger.info(`${upserts.length} new data references added/modified`);

    // Persist updated manifest, (pin, update Node DB entry)
    const { persistedManifestCid, date } = await persistManifest({ manifest: updatedManifest, node, userId: user.id });
    if (!persistedManifestCid)
      throw createManifestPersistFailError(
        `Failed to persist manifest: ${updatedManifest}, node: ${node}, userId: ${user.id}`,
      );

    /**
     * Update drive clock on automerge document
     */
    const latestDriveClock = await getLatestDriveTime(node.uuid as NodeUuid);
    try {
      await repoService.dispatchAction({
        uuid: node.uuid as NodeUuid,
        documentId: node.manifestDocumentId as DocumentId,
        actions: [{ type: 'Set Drive Clock', time: latestDriveClock }],
      });
      // await manifestUpdater({ type: 'Set Drive Clock', time: latestDriveClock });
    } catch (err) {
      logger.error({ err }, 'Set Drive Clock');
    }

    const tree = await getTreeAndFill(updatedManifest, node.uuid, user.id);

    return {
      ok: true,
      value: {
        // rootDataCid: newRootCidString,
        manifest: updatedManifest,
        manifestCid: persistedManifestCid,
        tree: tree,
        date: date,
      },
    };
    // SUCCESS
  } catch (error) {
    // DB status to failed
    // Socket emit to client
    // const manifest = await getLatestManifestFromNode(node);
    logger.error({ error }, 'Error processing S3 data to IPFS');
    if (pinResult.length) {
      handleCleanupOnMidProcessingError({
        pinnedFiles: pinResult,
        manifestPathsToDbComponentTypesMap: manifestPathsToTypesPrune,
        node,
        user,
      });
    }
    const controlledErr = 'type' in error ? error : createUnhandledError(error);
    return { ok: false, value: controlledErr };
  }
}

interface ProcessNewFolderParams {
  user: User;
  node: Node;
  contextPath: DrivePath;
  newFolderName: string;
}

/**
 * Proccesses regular file uploads, pins S3 files to IPFS, adds them to the end of the context DAG node, creates data references for them and updates the manifest.
 */
export async function processNewFolder({
  user,
  node,
  contextPath,
  newFolderName,
}: ProcessNewFolderParams): Promise<Either<UpdateResponse, ProcessingError>> {
  try {
    // External dir check
    await externalDirCheck(node.id, contextPath);

    // Make sure newFolderName doesn't contain any slashes
    newFolderName = newFolderName.replace(/\//g, '');

    // Check if paths are unique
    await ensureUniquePathsDraftTree({ nodeId: node.id, contextPath, externalUrlFilePaths: [newFolderName] });

    // Create new folder in draft node tree
    const newFolderEntry = await prisma.draftNodeTree.create({
      data: {
        path: contextPath + '/' + newFolderName,
        cid: DRAFT_DIR_CID,
        directory: true,
        size: 0,
        external: false,
        nodeId: node.id,
        // userId: user.id,
      },
    });

    const date = newFolderEntry.updatedAt;

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

    let ltsManifest = await getLatestManifestFromNode(ltsNode);

    /**
     * Update drive clock on automerge document
     */
    const latestDriveClock = await getLatestDriveTime(node.uuid as NodeUuid);
    try {
      // ltsManifest = await manifestUpdater({ type: 'Set Drive Clock', time: latestDriveClock });
      const response = await repoService.dispatchAction({
        uuid: node.uuid as NodeUuid,
        documentId: node.manifestDocumentId as DocumentId,
        actions: [{ type: 'Set Drive Clock', time: latestDriveClock }],
      });
      if (response?.manifest) {
        ltsManifest = response.manifest;
      }
    } catch (err) {
      logger.error({ err }, 'Set Drive Clock');
    }

    const tree = await getTreeAndFill(ltsManifest, node.uuid, user.id);

    return {
      ok: true,
      value: {
        manifest: ltsManifest,
        manifestCid: node.manifestUrl,
        tree: tree,
        date: date.toString(),
      },
    };
    // SUCCESS
  } catch (error) {
    // DB status to failed
    // Socket emit to client
    console.log({ error }, 'Error processing new folder');
    logger.error({ error }, 'Error processing new folder');
    const controlledErr = 'type' in error ? error : createUnhandledError(error);
    return { ok: false, value: controlledErr };
  }
}

/**
 * @param files to contain .size property on each file in the array
 * @returns true if space available, otherwise throws an error
 */
export async function ensureSpaceAvailable(files: any[], user: User) {
  let uploadSizeBytes = 0;
  if (files.length) files.forEach((f) => (uploadSizeBytes += f.size));

  const hasStorageSpaceToUpload = await hasAvailableDataUsageForUpload(user, { fileSizeBytes: uploadSizeBytes });
  if (!hasStorageSpaceToUpload)
    throw createNotEnoughSpaceError(
      `upload size of ${uploadSizeBytes} exceeds users data budget of ${user.currentDriveStorageLimitGb} GB`,
    );
  return true;
}

/*
 ** Guest file size upload limit per upload - currently 100MB.
 */
export function guestFileSizeLimitCheck(files: File[], user: Pick<User, 'isGuest'>) {
  if (user.isGuest) {
    const ONE_HUNDRED_MBS = 1000 * 1000 * 100;
    const totalSize = files.reduce((acc, file) => acc + file.size, 0);
    if (totalSize > ONE_HUNDRED_MBS) {
      throw createGuestFileSizeLimitError();
    }
  }
}

export function extractRootDagCidFromManifest(manifest: ResearchObjectV1, manifestCid: string) {
  const component = manifest.components.find((c) => isNodeRoot(c));
  const rootCid: string = component?.payload?.cid;
  if (!rootCid) throw createInvalidManifestError(`Root DAG not found in manifest, manifestCid: ${manifestCid}`);
  return rootCid;
}

export async function getManifestFromNode(
  node: Pick<Node, 'manifestUrl' | 'cid'>,
  queryString?: string,
): Promise<{ manifest: ResearchObjectV1; manifestCid: string }> {
  const manifestCid = node.manifestUrl || node.cid;
  const manifestUrlEntry = manifestCid ? cleanupManifestUrl(manifestCid as string, queryString as string) : null;
  try {
    const fetchedManifest = manifestUrlEntry ? await (await axios.get(manifestUrlEntry)).data : null;
    return { manifest: fetchedManifest, manifestCid };
  } catch (e) {
    throw createIpfsUnresolvableError(`Error fetching manifest from IPFS, manifestCid: ${manifestCid}`);
  }
}

export async function getManifestByCid(manifestCid: string, queryString?: string): Promise<ResearchObjectV1> {
  const cachedManifest = await getFromCache<ResearchObjectV1>(`manifest:${manifestCid}`);
  if (cachedManifest) {
    return cachedManifest;
  }
  const manifestUrlEntry = manifestCid ? cleanupManifestUrl(manifestCid, queryString as string) : null;
  try {
    const fetchedManifest = manifestUrlEntry ? await (await axios.get(manifestUrlEntry)).data : null;
    await setToCache(`manifest:${manifestCid}`, fetchedManifest);
    return fetchedManifest;
  } catch (e) {
    throw createIpfsUnresolvableError(`Error fetching manifest from IPFS, manifestCid: ${manifestCid}`);
  }
}

export function pathContainsExternalCids(flatTreeMap: Record<DrivePath, RecursiveLsResult>, contextPath: string) {
  // Check if update path contains externals, disable adding to external DAGs
  const pathMatch = flatTreeMap[contextPath];
  if (pathMatch?.external) throw createMixingExternalDataError();
  return false;
}

export interface EnsureUniquePathsParams {
  flatTreeMap: Record<DrivePath, RecursiveLsResult>;
  contextPath: string;
  filesBeingAdded?: any[];
  externalUrlFilePaths?: string[];
}

export function ensureUniquePaths({
  flatTreeMap,
  contextPath,
  filesBeingAdded,
  externalUrlFilePaths,
}: EnsureUniquePathsParams): boolean {
  // ensure all paths are unique to prevent borking datasets, reject if fails unique check

  let newPathsFormatted: string[] = [];
  const header = contextPath;
  if (filesBeingAdded?.length) {
    newPathsFormatted = filesBeingAdded.map((f) => {
      if (f.originalname[0] !== '/') f.originalname = '/' + f.originalname;
      return header + f.originalname;
    });
  }
  if (externalUrlFilePaths) {
    if (externalUrlFilePaths?.length > 0) {
      newPathsFormatted = externalUrlFilePaths.map((filePath) => {
        return header + '/' + filePath;
      });
    }
  }

  const hasDuplicates = newPathsFormatted.some((newPath) => newPath in flatTreeMap);
  if (hasDuplicates) {
    logger.info('[UPDATE DATASET] Rejected as duplicate paths were found');
    throw createDuplicateFileError();
  }
  return true;
}

export async function pinNewFiles(
  files: any[],
  { wrapWithDirectory = false, ipfsNode }: { wrapWithDirectory?: boolean; ipfsNode: IPFS_NODE },
): Promise<IpfsPinnedResult[]> {
  const structuredFilesForPinning: IpfsDirStructuredInput[] = await Promise.all(
    files.map(async (f: any) => {
      const path = f.originalname ?? f.path;
      if (isS3Configured && 'key' in f) {
        const fileStream = await fetchFileStreamFromS3(f.key);
        return { path, content: fileStream };
      }
      const content = f.buffer ?? f.content;
      return { path, content };
    }),
  );
  let uploaded: IpfsPinnedResult[];
  if (structuredFilesForPinning.length) {
    if (structuredFilesForPinning.length)
      uploaded = await pinDirectory(structuredFilesForPinning, { wrapWithDirectory, node: ipfsNode });
    if (!uploaded.length) throw createIpfsUploadFailureError();
    logger.info({ uploaded }, '[UPDATE DATASET] Pinned files: ');
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
  const componentIndex = manifest.components.findIndex((c) => isNodeRoot(c));
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
  componentTypeMap?: ResearchObjectComponentTypeMap;
  componentType?: ResearchObjectComponentType;
  componentSubtype?: ResearchObjectComponentSubtypes;
  externalUrl?: { url: string; path: string };
  star?: boolean;
}

/**
 * Create a new component(s) for the files passed in
 */
export function predefineComponentsForPinnedFiles({
  pinnedFirstNestingFiles,
  contextPath,
  componentType,
  componentSubtype,
  componentTypeMap = {},
  externalUrl,
  star,
}: PredefineComponentsForPinnedFilesParams): FirstNestingComponent[] {
  const firstNestingComponents: FirstNestingComponent[] = pinnedFirstNestingFiles.map((file) => {
    const neutralFullPath = file.path.startsWith(contextPath) ? file.path : contextPath + '/' + file.path;
    const pathSplit = file.path.split('/');
    const name = pathSplit.pop();
    return {
      name: name,
      path: neutralFullPath,
      cid: file.cid,
      componentType: componentType || extractComponentTypeFromTypeMap(neutralFullPath, componentTypeMap),
      componentSubtype,
      ...(star && { star: true }),
      ...(externalUrl && { externalUrl: externalUrl.url }),
    };
  });
  return firstNestingComponents;
}

interface UpdateDataReferencesParams {
  node: Node;
  user: User;
  updatedManifest: ResearchObjectV1;
}
export async function updateDataReferences({ node, user, updatedManifest }: UpdateDataReferencesParams) {
  const newRefs = await prepareDataRefsForDraftTrees(node.uuid, updatedManifest);

  // Get old refs to match their DB entry id's with the updated refs
  const existingRefs = user.isGuest
    ? await prisma.guestDataReference.findMany({
        where: {
          nodeId: node.id,
          userId: user.id,
          type: { not: DataType.MANIFEST },
        },
      })
    : await prisma.dataReference.findMany({
        where: {
          nodeId: node.id,
          userId: user.id,
          type: { not: DataType.MANIFEST },
        },
      });

  // Map existing ref neutral paths to the ref for constant lookup
  const existingRefMap = existingRefs.reduce((map, ref) => {
    if (ref.path) {
      map[neutralizePath(ref.path)] = ref;
    }
    return map;
  }, {});

  const dataRefCreates = [];
  const dataRefUpdates = [];
  // setup refs, matching existing ones with their id, distinguish between update ops and create ops
  newRefs.forEach((ref) => {
    const newRefNeutralPath = neutralizePath(ref.path);
    const matchingExistingRef = existingRefMap[newRefNeutralPath];
    if (matchingExistingRef) {
      dataRefUpdates.push({ ...matchingExistingRef, ...ref, ...(user.isGuest ? attachLoggedData() : {}) });
    } else {
      dataRefCreates.push({ ...ref, ...(user.isGuest ? attachLoggedData() : {}) });
    }
  });

  const upserts = await prisma.$transaction([
    ...(dataRefUpdates as any).map((fd) => {
      return user.isGuest
        ? prisma.guestDataReference.update({ where: { id: fd.id }, data: fd })
        : prisma.dataReference.update({ where: { id: fd.id }, data: fd });
    }),
    user.isGuest
      ? prisma.guestDataReference.createMany({ data: dataRefCreates })
      : prisma.dataReference.createMany({ data: dataRefCreates }),
  ]);
  return upserts;
}

interface CleanupDanglingReferencesParams {
  node: Node;
  user: User;
  newRootCidString: string;
  externalCidMap: ExternalCidMap;
  oldTreePathsMap: Record<DrivePath, RecursiveLsResult>;
  manifestPathsToDbComponentTypesMap: Record<DrivePath, DataType | ExtensionDataTypeMap>;
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
    await getDirectoryTree(newRootCidString, externalCidMap, { ipfsNode: getNodeToUse(user.isGuest) }),
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
  manifestPathsToDbComponentTypesMap: Record<DrivePath, DataType | ExtensionDataTypeMap>;
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
      directory: await isDir(CID.parse(e.cid), getNodeToUse(user.isGuest)),
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

/**
 * Constructs a ComponentTypeMap from a list of files.
 * @example ['hi.py', 'text.txt'] => { '.py': ROCT.CODE, '.txt': ROCT.DATA }
 */
export function constructComponentTypeMapFromFiles(files: any[]): ResearchObjectComponentTypeMap {
  const componentTypeMap = {};
  files.forEach((f) => {
    const path = f.originalname ?? f.path;
    const extension = extractExtension(path);
    const cType = EXTENSION_MAP[extension?.toLowerCase()] ?? DEFAULT_COMPONENT_TYPE;
    componentTypeMap[extension] = cType;
  });
  return componentTypeMap;
}

export async function assignTypeMapInManifest(
  node: Node,
  manifest: ResearchObjectV1,
  compTypeMap: ResearchObjectComponentTypeMap,
  contextPath: DrivePath,
  contextPathNewCid: string,
): Promise<ResearchObjectV1> {
  try {
    let document: ResearchObjectDocument;
    const componentIndex = manifest.components.findIndex((c) => c.payload.path === contextPath);
    // Check if the component already exists, update its type map
    if (componentIndex !== -1) {
      const prevComponent = manifest.components[componentIndex];
      document = await repoService.dispatchAction({
        uuid: node.uuid as NodeUuid,
        documentId: node.manifestDocumentId as DocumentId,
        actions: [
          {
            type: 'Assign Component Type',
            component: prevComponent,
            componentTypeMap: compTypeMap,
          },
        ],
      });
    } else {
      // If doesn't exist, create the component and assign its type map
      const compName = contextPath.split('/').pop();
      const component = {
        id: v4(),
        name: compName,
        type: compTypeMap,
        payload: {
          cid: contextPathNewCid,
          path: contextPath,
        },
      };
      document = await repoService.dispatchAction({
        uuid: node.uuid as NodeUuid,
        documentId: node.manifestDocumentId as DocumentId,
        actions: [{ type: 'Add Components', components: [component] }],
      });
    }
    return document.manifest;
  } catch (err) {
    logger.error(err, 'Error Caught in assignTypeMapInManifest');
    return manifest;
  }
}

/**
 * Proccesses regular file uploads, pins S3 files to IPFS, adds them to the end of the context DAG node, creates data references for them and updates the manifest.
 */
export async function processUploadToIpfs({
  files,
  ipfsNode,
}: {
  files:
    | {
        [fieldname: string]: Express.Multer.File[];
      }
    | Express.Multer.File[];
  ipfsNode: IPFS_NODE;
}): Promise<Either<IpfsPinnedResult[], ProcessingError>> {
  let pinResult: IpfsPinnedResult[] = [];
  try {
    const uploads = Array.isArray(files) ? files : Object.values(files).map((files) => files[0]);
    // Pin new files, add draftNodeTree entries
    pinResult = await pinNewFiles(uploads, { wrapWithDirectory: false, ipfsNode });
    if (pinResult) {
      logger.info({ pinResult }, 'Files uploaded to Ipfs');
    }

    return {
      ok: true,
      value: pinResult,
    };
    // SUCCESS
  } catch (error) {
    logger.error({ error }, 'Error processing S3 data to IPFS');
    const controlledErr = 'type' in error ? error : createUnhandledError(error);
    return { ok: false, value: controlledErr };
  }
}
