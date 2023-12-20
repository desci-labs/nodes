import fs from 'fs';

import {
  DrivePath,
  FileType,
  IpfsPinnedResult,
  RecursiveLsResult,
  ResearchObjectComponentSubtypes,
  ResearchObjectComponentType,
  neutralizePath,
  recursiveFlattenTree,
} from '@desci-labs/desci-models';
import { DataType, User, Node, Prisma } from '@prisma/client';
import axios from 'axios';
import { rimraf } from 'rimraf';

import prisma from 'client';
import { persistManifest } from 'controllers/data/utils';
import parentLogger from 'logger';
import { hasAvailableDataUsageForUpload } from 'services/dataService';
import { ensureUniquePathsDraftTree, externalDirCheck } from 'services/draftTrees';
import { IpfsDirStructuredInput, addDirToIpfs, addFilesToDag, getDirectoryTree } from 'services/ipfs';
import {
  calculateTotalZipUncompressedSize,
  extractZipFileAndCleanup,
  processExternalUrls,
  saveZipStreamToDisk,
  zipUrlToStream,
} from 'utils';
import { DRAFT_DIR_CID, ipfsDagToDraftNodeTreeEntries } from 'utils/draftTreeUtils';
import {
  ExtensionDataTypeMap,
  addComponentsToManifest,
  generateExternalCidMap,
  generateManifestPathsToDbTypeMap,
  getTreeAndFill,
  updateManifestComponentDagCids,
} from 'utils/driveUtils';

import {
  cleanupDanglingRefs,
  ensureUniquePaths,
  extractRootDagCidFromManifest,
  filterFirstNestings,
  getManifestFromNode,
  handleCleanupOnMidProcessingError,
  pathContainsExternalCids,
  pinNewFiles,
  predefineComponentsForPinnedFiles,
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

/**
 * Processes external-url file uploads, currently .pdf URLs and github code repo's
 */
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
    const { manifest, manifestCid } = await getManifestFromNode(node);
    manifestPathsToTypesPrune = generateManifestPathsToDbTypeMap(manifest);

    // We can optionally do this after file resolution, may be more useful for code repos than pdfs
    // const componentTypeMap: ResearchObjectComponentTypeMap = constructComponentTypeMapFromFiles([externalUrl]);

    // External dir check
    await externalDirCheck(node.id, contextPath);

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

    // Check if paths are unique
    const externalUrlFilePaths = [externalUrl.path];
    await ensureUniquePathsDraftTree({ nodeId: node.id, contextPath, externalUrlFilePaths });

    // Pin new files, add draftNodeTree entries
    if (externalUrlFiles?.length) {
      // External URL non-repo
      pinResult = await pinNewFiles(externalUrlFiles, true);
    } else if (zipPath?.length > 0) {
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
    // debugger;
    const root = pinResult[pinResult.length - 1];
    const isCodeRepo = zipPath.length > 0;
    let uploadedTree = (await getDirectoryTree(root.cid, {})) as RecursiveLsResult[];
    if (isCodeRepo) {
      // Overrides the path name of the root directory
      const rootName = externalUrl.path;
      uploadedTree = [{ ...root, type: 'dir', name: rootName, contains: uploadedTree }];
    }

    // Prepare draft node tree entires
    const flatUploadedTree = recursiveFlattenTree(uploadedTree);

    const parsedContextPath = isCodeRepo ? contextPath + '/' + externalUrl.path : contextPath;
    const draftNodeTreeEntries: Prisma.DraftNodeTreeCreateManyInput[] = await ipfsDagToDraftNodeTreeEntries({
      ipfsTree: flatUploadedTree,
      node,
      user,
      contextPath: parsedContextPath,
    });

    const addedEntries = await prisma.draftNodeTree.createMany({
      data: draftNodeTreeEntries,
      skipDuplicates: true,
    });
    logger.info(`Successfully added ${addedEntries.count} entries to DraftNodeTree`);
    // debugger;

    const { filesToAddToDag, filteredFiles } = filterFirstNestings(pinResult);

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
    let updatedManifest = ltsManifest;

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
        externalUrl,
      });
      updatedManifest = addComponentsToManifest(updatedManifest, firstNestingComponents);
    }

    // Update existing data references, add new data references.
    const upserts = await updateDataReferences({ node, user, updatedManifest });
    if (upserts) logger.info(`${upserts.length} new data references added/modified`);

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
