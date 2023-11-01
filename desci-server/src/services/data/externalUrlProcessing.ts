import fs from 'fs';

import {
  DrivePath,
  IpfsPinnedResult,
  RecursiveLsResult,
  ResearchObjectComponentSubtypes,
  ResearchObjectComponentType,
  ResearchObjectComponentTypeMap,
  neutralizePath,
  recursiveFlattenTree,
} from '@desci-labs/desci-models';
import { DataType, User, Node } from '@prisma/client';
import axios from 'axios';
import { rimraf } from 'rimraf';

import prisma from 'client';
import { persistManifest } from 'controllers/data/utils';
import parentLogger from 'logger';
import { hasAvailableDataUsageForUpload } from 'services/dataService';
import { IpfsDirStructuredInput, addDirToIpfs, addFilesToDag, getDirectoryTree } from 'services/ipfs';
import {
  calculateTotalZipUncompressedSize,
  extractZipFileAndCleanup,
  processExternalUrls,
  saveZipStreamToDisk,
  zipUrlToStream,
} from 'utils';
import {
  ExtensionDataTypeMap,
  generateExternalCidMap,
  generateManifestPathsToDbTypeMap,
  getTreeAndFill,
  updateManifestComponentDagCids,
} from 'utils/driveUtils';

import {
  assignTypeMapInManifest,
  cleanupDanglingRefs,
  constructComponentTypeMapFromFiles,
  ensureUniquePaths,
  extractRootDagCidFromManifest,
  filterFirstNestings,
  getManifestFromNode,
  handleCleanupOnMidProcessingError,
  pathContainsExternalCids,
  pinNewFiles,
  updateDataReferences,
  updateManifestDataBucket,
} from './processing';
import {
  createDagExtensionFailureError,
  createExternalUrlResolutionError,
  createManifestPersistFailError,
  createNotEnoughSpaceError,
  createUnhandledError,
} from './processingErrors';

const TEMP_REPO_ZIP_PATH = './repo-tmp';

const logger = parentLogger.child({
  module: 'Services::ExternalUrlProcessing',
});

interface ProcessExternalUrlDataToIpfsParams {
  // files: any[];
  externalUrl: any;
  user: User;
  node: Node;
  /**
   * @type {string} path to the directory to be updated
   */
  contextPath: string;
  componentType?: ResearchObjectComponentType;
  componentSubtype?: ResearchObjectComponentSubtypes;
}

export async function processExternalUrlDataToIpfs({
  externalUrl,
  user,
  node,
  contextPath,
  componentType,
  componentSubtype,
}: ProcessExternalUrlDataToIpfsParams) {
  let pinResult: IpfsPinnedResult[] = [];
  let manifestPathsToTypesPrune: Record<DrivePath, DataType | ExtensionDataTypeMap> = {};
  try {
    debugger;
    const { manifest, manifestCid } = await getManifestFromNode(node);
    const rootCid = extractRootDagCidFromManifest(manifest, manifestCid);
    manifestPathsToTypesPrune = generateManifestPathsToDbTypeMap(manifest);

    // We can optionally do this after file resolution, may be more useful for code repos than pdfs
    // const componentTypeMap: ResearchObjectComponentTypeMap = constructComponentTypeMapFromFiles([externalUrl]);

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

    /*
     ** External URL setup, currently used for Github Code Repositories & external PDFs
     */
    let externalUrlFiles: IpfsDirStructuredInput[];
    let externalUrlTotalSizeBytes: number;
    let zipPath = ''; // for code repos
    if (
      (externalUrl &&
        externalUrl?.path?.length &&
        externalUrl?.url?.length &&
        componentType === ResearchObjectComponentType.CODE) ||
      (externalUrl && externalUrl?.url?.length && componentType === ResearchObjectComponentType.PDF)
    ) {
      try {
        /**
         * External URL code, only supports github for now
         * Temporarily saves to VM disk, uploads to ipfs, cleans up after.
         */
        if (componentType === ResearchObjectComponentType.CODE) {
          const processedUrl = await processExternalUrls(externalUrl.url, componentType);
          const zipStream = await zipUrlToStream(processedUrl);
          zipPath = TEMP_REPO_ZIP_PATH + '/' + user.id + '_' + Date.now() + '.zip';

          fs.mkdirSync(zipPath.replace('.zip', ''), { recursive: true });
          await saveZipStreamToDisk(zipStream, zipPath);
          const totalSize = await calculateTotalZipUncompressedSize(zipPath);
          externalUrlTotalSizeBytes = totalSize;
        }
        /**
         * External URL pdf, uses buffer
         */
        if (componentType === ResearchObjectComponentType.PDF) {
          const url = externalUrl.url;
          const res = await axios.get(url, { responseType: 'arraybuffer' });
          const buffer = Buffer.from(res.data, 'binary');
          externalUrlFiles = [{ path: externalUrl.path, content: buffer }];
          externalUrlTotalSizeBytes = buffer.length;
        }
      } catch (e) {
        logger.warn(
          { err: e },
          `[UPDATE DAG] Error: External URL method: ${e}, url provided: ${externalUrl?.url}, path: ${externalUrl?.path}`,
        );
        throw createExternalUrlResolutionError(`Error fetching content from external link. URL: ${externalUrl.url}`);
      }
    }

    const hasStorageSpaceToUpload = await hasAvailableDataUsageForUpload(user, {
      fileSizeBytes: externalUrlTotalSizeBytes,
    });
    if (!hasStorageSpaceToUpload)
      throw createNotEnoughSpaceError(
        `upload size of ${externalUrlTotalSizeBytes} exceeds users data budget of ${user.currentDriveStorageLimitGb} GB`,
      );

    const splitContextPath = contextPath.split('/');
    splitContextPath.shift();
    //rootlessContextPath = how many dags need to be reset, n + 1, used for addToDag function
    const rootlessContextPath = splitContextPath.join('/');

    // Check if paths are unique
    const externalUrlFilePaths = [externalUrl.path];
    ensureUniquePaths({ flatTreeMap: oldTreePathsMap, contextPath, externalUrlFilePaths });

    debugger
    // Pin new files, structure for DAG extension, add to DAG
    if (externalUrlFiles?.length) {
      // External URL non-repo
      pinResult = await pinNewFiles(externalUrlFiles);
    } else if (zipPath?.length > 0) {
      debugger
      const outputPath = zipPath.replace('.zip', '');
      logger.debug({ outputPath }, 'Starting unzipping to output directory');
      await extractZipFileAndCleanup(zipPath, outputPath);
      logger.debug({ outputPath }, 'extraction complete, starting pinning');
      pinResult = await addDirToIpfs(outputPath);
      // Overrides the path name of the root directory
      pinResult[pinResult.length - 1].path = externalUrl.path;

      // Cleanup
      await rimraf(outputPath);
    }

    const { filesToAddToDag, filteredFiles } = filterFirstNestings(pinResult);
    const {
      updatedRootCid: newRootCidString,
      updatedDagCidMap,
      contextPathNewCid,
    } = await addFilesToDag(rootCid, rootlessContextPath, filesToAddToDag);
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
    if (Object.keys(updatedDagCidMap)?.length) {
      updatedManifest = updateManifestComponentDagCids(updatedManifest, updatedDagCidMap);
    }

    // needs fixing
    // if (componentTypeMap) {
    //   updatedManifest = assignTypeMapInManifest(updatedManifest, componentTypeMap, contextPath, contextPathNewCid);
    // }

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
      throw createManifestPersistFailError(
        `Failed to persist manifest: ${updatedManifest}, node: ${node}, userId: ${user.id}`,
      );

    const tree = await getTreeAndFill(updatedManifest, node.uuid, user.id);

    return {
      ok: true,
      value: {
        rootDataCid: newRootCidString,
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
