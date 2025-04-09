import fs from 'fs';

import { DocumentId } from '@automerge/automerge-repo';
import {
  DrivePath,
  FileType,
  IpfsPinnedResult,
  RecursiveLsResult,
  ResearchObjectComponentSubtypes,
  ResearchObjectComponentType,
  ResearchObjectV1,
  recursiveFlattenTree,
} from '@desci-labs/desci-models';
import { DataType, User, Node, Prisma } from '@prisma/client';
import axios from 'axios';
import { rimraf } from 'rimraf';

import { prisma } from '../../client.js';
import { persistManifest } from '../../controllers/data/utils.js';
import { logger as parentLogger } from '../../logger.js';
import { hasAvailableDataUsageForUpload } from '../../services/dataService.js';
import { ensureUniquePathsDraftTree, externalDirCheck, getLatestDriveTime } from '../../services/draftTrees.js';
import { IpfsDirStructuredInput, addDirToIpfs, getDirectoryTree, getNodeToUse } from '../../services/ipfs.js';
import { ipfsDagToDraftNodeTreeEntries } from '../../utils/draftTreeUtils.js';
import {
  ExtensionDataTypeMap,
  addComponentsToDraftManifest,
  generateManifestPathsToDbTypeMap,
  getTreeAndFill,
} from '../../utils/driveUtils.js';
import {
  calculateTotalZipUncompressedSize,
  extractZipFileAndCleanup,
  processExternalUrls,
  saveZipStreamToDisk,
  zipUrlToStream,
} from '../../utils.js';
import { NodeUuid, getLatestManifestFromNode } from '../manifestRepo.js';
import repoService from '../repoService.js';

import {
  filterFirstNestings,
  handleCleanupOnMidProcessingError,
  pinNewFiles,
  predefineComponentsForPinnedFiles,
  updateDataReferences,
} from './processing.js';
import {
  createExternalUrlResolutionError,
  createManifestPersistFailError,
  createNotEnoughSpaceError,
  createUnhandledError,
} from './processingErrors.js';

const TEMP_REPO_ZIP_PATH = './repo-tmp';

const logger = parentLogger.child({
  module: 'Services::ExternalUrlProcessing',
});

interface ProcessExternalUrlDataToIpfsParams {
  // files: any[];
  externalUrl: { path: string; url: string; doi?: string };
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
  autoStar,
}: ProcessExternalUrlDataToIpfsParams) {
  // debugger;
  let pinResult: IpfsPinnedResult[] = [];
  let manifestPathsToTypesPrune: Record<DrivePath, DataType | ExtensionDataTypeMap> = {};
  try {
    const manifest = await getLatestManifestFromNode(node);
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
          const response = await axios.head(url);
          const contentType = response.headers['content-type'];

          if (contentType === 'application/pdf') {
            const res = await axios.get(url, { responseType: 'arraybuffer' });
            const buffer = Buffer.from(res.data, 'binary');
            externalUrlFiles = [{ path: externalUrl.path, content: buffer }];
            externalUrlTotalSizeBytes = buffer.length;
          } else {
            throw new Error('Invalid file type. Only PDF files are supported.');
          }
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
      pinResult = await pinNewFiles(externalUrlFiles, {
        wrapWithDirectory: false,
        ipfsNode: getNodeToUse(user.isGuest),
      });
    } else if (zipPath?.length > 0) {
      const outputPath = zipPath.replace('.zip', '');
      logger.debug({ outputPath }, 'Starting unzipping to output directory');
      await extractZipFileAndCleanup(zipPath, outputPath);
      logger.debug({ outputPath }, 'extraction complete, starting pinning');
      pinResult = await addDirToIpfs(outputPath, getNodeToUse(user.isGuest));
      // Overrides the path name of the root directory
      pinResult[pinResult.length - 1].path = externalUrl.path;

      // Cleanup
      await rimraf(outputPath);
    }
    // debugger;
    const root = pinResult[pinResult.length - 1];
    const isCodeRepo = zipPath.length > 0;
    let uploadedTree;
    if (isCodeRepo) {
      uploadedTree = (await getDirectoryTree(root.cid, {})) as RecursiveLsResult[];
      // Overrides the path name of the root directory
      const rootName = externalUrl.path;
      uploadedTree = [{ ...root, type: 'dir', name: rootName, contains: uploadedTree }];
    } else {
      const fileUploaded = pinResult[0];
      uploadedTree = [{ ...fileUploaded, type: FileType.FILE, path: 'root/' + fileUploaded.path }];
    }

    // Prepare draft node tree entires
    const flatUploadedTree = recursiveFlattenTree(uploadedTree);

    const parsedContextPath = isCodeRepo ? contextPath + '/' + externalUrl.path : contextPath;
    const draftNodeTreeEntries: Prisma.DraftNodeTreeCreateManyInput[] = ipfsDagToDraftNodeTreeEntries({
      ipfsTree: flatUploadedTree as RecursiveLsResult[],
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

    const { filteredFiles } = filterFirstNestings(pinResult);

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

    let updatedManifest: ResearchObjectV1;
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
        star: autoStar,
      });

      if (firstNestingComponents?.length > 0) {
        updatedManifest = await addComponentsToDraftManifest(node, firstNestingComponents);
      }

      logger.info({ EXTERNAL_DOI: externalUrl }, 'External URL DOI');
      if (componentType === ResearchObjectComponentType.PDF && externalUrl.doi) {
        const componentIndex = updatedManifest.components.findIndex(
          (comp) => comp.type === ResearchObjectComponentType.PDF,
        );
        const comp = updatedManifest.components[componentIndex];
        const res = await repoService.dispatchAction({
          uuid: node.uuid,
          documentId: node.manifestDocumentId as DocumentId,
          actions: [
            {
              type: 'Update Component',
              component: {
                ...comp,
                payload: {
                  ...comp.payload,
                  ...(externalUrl.doi && {
                    doi: [externalUrl.doi],
                  }),
                },
              },
              componentIndex,
            },
          ],
        });
        updatedManifest = res.manifest;
      }
    }

    updatedManifest =
      updatedManifest ??
      (await repoService.getDraftManifest({ uuid: ltsNode.uuid as NodeUuid, documentId: ltsNode.manifestDocumentId }));

    // Update existing data references, add new data references.
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
      const response = await repoService.dispatchAction({
        uuid: node.uuid as NodeUuid,
        documentId: node.manifestDocumentId as DocumentId,
        actions: [{ type: 'Set Drive Clock', time: latestDriveClock }],
      });
      if (response) {
        updatedManifest = response.manifest;
      }
    } catch (err) {
      logger.error({ err }, 'ERROR: Set Drive Clock');
    }

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
