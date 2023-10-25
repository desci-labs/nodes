import fs from 'fs';

import {
  neutralizePath,
  recursiveFlattenTree,
  ResearchObjectComponentType,
  ResearchObjectV1,
  DriveObject,
  DrivePath,
} from '@desci-labs/desci-models';
import { User } from '@prisma/client';
import axios from 'axios';
import { Response } from 'express';
import { rimraf } from 'rimraf';

import prisma from 'client';
import parentLogger from 'logger';
import { AuthedRequest } from 'middleware/ensureWriteAccess';
import {
  cleanupDanglingRefs,
  extractRootDagCidFromManifest,
  filterFirstNestings,
  getManifestFromNode,
  handleCleanupOnMidProcessingError,
  processS3DataToIpfs,
  updateDataReferences,
  updateManifestDataBucket,
} from 'services/data/processing';
import { hasAvailableDataUsageForUpload } from 'services/dataService';
import {
  addDirToIpfs,
  addFilesToDag,
  getDirectoryTree,
  IpfsDirStructuredInput,
  IpfsPinnedResult,
  pinDirectory,
  RecursiveLsResult,
} from 'services/ipfs';
import { fetchFileStreamFromS3, isS3Configured } from 'services/s3';
import {
  arrayXor,
  calculateTotalZipUncompressedSize,
  extractZipFileAndCleanup,
  processExternalUrls,
  saveZipStreamToDisk,
  zipUrlToStream,
} from 'utils';
import {
  FirstNestingComponent,
  addComponentsToManifest,
  generateExternalCidMap,
  generateManifestPathsToDbTypeMap,
  getTreeAndFill,
  updateManifestComponentDagCids,
} from 'utils/driveUtils';

import { persistManifest } from './utils';
import { error } from 'console';

const TEMP_REPO_ZIP_PATH = './repo-tmp';
export interface UpdateResponse {
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

export const update = async (req: AuthedRequest, res: Response<UpdateResponse | ErrorResponse | string>) => {
  const owner = req.user;
  const node = req.node;
  const { uuid, manifest, contextPath, componentType, componentSubtype, newFolderName } = req.body;
  let { externalUrl, externalCids } = req.body;
  //Require XOR (files, externalCid, externalUrl, newFolder)
  //ExternalURL - url + type, code (github) & external pdfs for now
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
  if (externalCids && Object.entries(externalCids).length > 0)
    return res.status(400).json({ error: 'EXTERNAL CID PASSED IN, use externalCid update route instead' });

  // const files = req.files as Express.Multer.File[];
  const files = req.files as any[];
  if (!arrayXor([externalUrl, files.length, newFolderName?.length]))
    return res
      .status(400)
      .json({ error: 'Choose between one of the following; files, new folder, externalUrl or externalCids' });

  // debugger
  if (files.length) {
    // temp short circuit for testing if regular files are being uploaded
    const { ok, value } = await processS3DataToIpfs({
      files,
      user: owner,
      node,
      contextPath,
      componentType,
      componentSubtype,
    });
    if (ok) {
      const {
        rootDataCid: newRootCidString,
        manifest: updatedManifest,
        manifestCid: persistedManifestCid,
        tree: tree,
        date: date,
      } = value as UpdateResponse
      return res.status(200).json({
        rootDataCid: newRootCidString,
        manifest: updatedManifest,
        manifestCid: persistedManifestCid,
        tree: tree,
        date: date,
      });
    } else {
      if (!('message' in value)) return res.status(500)
      logger.error({value}, 'processing error occured')
      return res.status(value.status).json({ status: value.status, error: value.message })
    }
  }

  /*
   ** External URL setup, currnetly used for Github Code Repositories & external PDFs
   */
  let externalUrlFiles: IpfsDirStructuredInput[];
  let externalUrlTotalSizeBytes: number;
  let zipPath = '';
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
        const zipStream = await zipUrlToStream(processedUrl);
        zipPath = TEMP_REPO_ZIP_PATH + '/' + owner.id + '_' + Date.now() + '.zip';

        fs.mkdirSync(zipPath.replace('.zip', ''), { recursive: true });
        await saveZipStreamToDisk(zipStream, zipPath);
        const totalSize = await calculateTotalZipUncompressedSize(zipPath);
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

  //finding rootCid
  const { manifest: latestManifestEntry, manifestCid: manifestCidEntry } = await getManifestFromNode(
    node,
    req.query?.g as string,
  );
  const rootCid = extractRootDagCidFromManifest(latestManifestEntry, manifestCidEntry);

  const manifestPathsToTypesPrune = generateManifestPathsToDbTypeMap(latestManifestEntry);

  /*
   ** Check if user has enough storage space to upload
   */
  let uploadSizeBytes = 0;
  // if (files.length) files.forEach((f) => (uploadSizeBytes += f.size));
  if (externalUrl) uploadSizeBytes += externalUrlTotalSizeBytes;
  const hasStorageSpaceToUpload = await hasAvailableDataUsageForUpload(owner, { fileSizeBytes: uploadSizeBytes });
  if (!hasStorageSpaceToUpload)
    return res.status(400).json({
      error: `upload size of ${uploadSizeBytes} exceeds users data budget of ${owner.currentDriveStorageLimitGb} GB`,
    });

  //Pull old tree
  const externalCidMap = await generateExternalCidMap(node.uuid);
  const oldFlatTree = recursiveFlattenTree(await getDirectoryTree(rootCid, externalCidMap)) as RecursiveLsResult[];
  oldFlatTree.push({ cid: rootCid, path: rootCid, name: 'Old Root Dir', type: 'dir', size: 0 });

  /*
   ** Check if update path contains externals, disable adding to external DAGs
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
  const oldTreePathsMap: Record<DrivePath, RecursiveLsResult> = oldFlatTree.reduce((map, branch) => {
    map[neutralizePath(branch.path)] = branch;
    return map;
  }, {});

  let newPathsFormatted: string[] = [];
  const header = !!cleanContextPath ? rootCid + '/' + cleanContextPath : rootCid;
  if (files.length) {
    newPathsFormatted = files.map((f) => {
      if (f.originalname[0] !== '/') f.originalname = '/' + f.originalname;
      return header + f.originalname;
    });
  }
  if (externalUrl) {
    if (externalUrlFiles?.length > 0) {
      newPathsFormatted = externalUrlFiles.map((f) => {
        return header + '/' + f.path;
      });
    }

    // Code repo, add repo dir path
    if (zipPath.length > 0) {
      newPathsFormatted = [header + '/' + externalUrl.path];
    } else {
    }
  }

  if (newFolderName) {
    newPathsFormatted = [header + '/' + newFolderName];
  }
  const hasDuplicates = newPathsFormatted.some((newPath) => newPath in oldTreePathsMap);
  if (hasDuplicates) {
    logger.info('[UPDATE DATASET] Rejected as duplicate paths were found');
    return res.status(400).json({ error: 'Duplicate files rejected' });
  }

  //Pin the new files
  const structuredFilesForPinning: IpfsDirStructuredInput[] = await Promise.all(
    files.map(async (f: any) => {
      if (isS3Configured) {
        const fileStream = await fetchFileStreamFromS3(f.key);
        return { path: f.originalname, content: fileStream };
      }
      return { path: f.originalname, content: f.buffer };
    }),
  );

  if (structuredFilesForPinning.length || externalUrlFiles?.length) {
    const filesToPin = structuredFilesForPinning.length ? structuredFilesForPinning : externalUrlFiles;
    if (filesToPin.length) uploaded = await pinDirectory(filesToPin);
    if (!uploaded.length) return res.status(400).json({ error: 'Failed uploading to ipfs' });
    logger.info('[UPDATE DATASET] Pinned files: ', uploaded.length);
  }

  // Pin the zip file (CODE REPO)
  if (zipPath.length > 0) {
    const outputPath = zipPath.replace('.zip', '');
    logger.debug({ outputPath }, 'Starting unzipping to output directory');
    await extractZipFileAndCleanup(zipPath, outputPath);
    logger.debug({ outputPath }, 'extraction complete, starting pinning');
    const pinResult = await addDirToIpfs(outputPath);

    // Overrides the path name of the root directory
    pinResult[pinResult.length - 1].path = externalUrl.path;
    uploaded = pinResult;

    // Cleanup
    await rimraf(outputPath);
  }

  //New folder creation, add to uploaded
  if (newFolderName) {
    const newFolder = await pinDirectory([{ path: newFolderName + '/.nodeKeep', content: Buffer.from('') }]);
    if (!newFolder.length) return res.status(400).json({ error: 'Failed creating new folder' });
    uploaded = newFolder;
  }

  /*
   ** Add files to dag, get new root cid
   */
  //Filtered to first nestings only
  const { filesToAddToDag, filteredFiles } = filterFirstNestings(uploaded);

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

  const { manifest: latestManifest } = await getManifestFromNode(ltsNode);

  let updatedManifest = updateManifestDataBucket({
    manifest: latestManifest,
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

  // //For adding correct types to the db, when a predefined component type is used **PROBABLY NO LONGER NEEDED WITH prepareDataRefs()**
  // const newFilePathDbTypeMap = {};
  // uploaded.forEach((file: IpfsPinnedResult) => {
  //   const neutralFullPath = contextPath + '/' + file.path;
  //   const deneutralizedFullPath = deneutralizePath(neutralFullPath, newRootCidString);
  //   newFilePathDbTypeMap[deneutralizedFullPath] = ROTypesToPrismaTypes[componentType] || DataType.UNKNOWN;
  // });

  try {
    const upserts = await updateDataReferences({
      node: ltsNode,
      user: owner,
      updatedManifest,
      newRootCidString,
      externalCidMap,
    });

    if (upserts) logger.info(`${upserts.length} new data references added/modified`);

    // //CLEANUP DANGLING REFERENCES//
    const pruneRes = await cleanupDanglingRefs({
      newRootCidString,
      externalCidMap,
      oldTreePathsMap,
      manifestPathsToDbComponentTypesMap: manifestPathsToTypesPrune,
      node,
      user: owner as User,
    });
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
    if (uploaded.length) {
      handleCleanupOnMidProcessingError({
        pinnedFiles: uploaded,
        manifestPathsToDbComponentTypesMap: manifestPathsToTypesPrune,
        node,
        user: owner,
      });
    }
    return res.status(400).json({ error: 'failed #1' });
  }
};
