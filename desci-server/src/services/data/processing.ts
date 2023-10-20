import {
  DrivePath,
  RecursiveLsResult,
  ResearchObjectComponentType,
  ResearchObjectV1,
  neutralizePath,
  recursiveFlattenTree,
} from '@desci-labs/desci-models';
import { User, Node } from '@prisma/client';
import axios from 'axios';

import { cleanupManifestUrl } from 'controllers/nodes';
import parentLogger from 'logger';
import { hasAvailableDataUsageForUpload } from 'services/dataService';
import { getDirectoryTree } from 'services/ipfs';
import { generateExternalCidMap, generateManifestPathsToDbTypeMap } from 'utils/driveUtils';

interface ProcessS3DataToIpfsParams {
  files: any[];
  user: User;
  node: Node;
  /**
   * @type {string} path to the directory to be updated
   */
  contextPath: string;
}

const logger = parentLogger.child({
  module: 'Services::Processing',
});

export async function processS3DataToIpfs({ files, user, node, contextPath }: ProcessS3DataToIpfsParams) {
  try {
    ensureSpaceAvailable(files, user);

    const { manifest, manifestCid } = await getManifestFromNode(node);
    const rootCid = extractRootDagCidFromManifest(manifest, manifestCid);
    const manifestPathsToTypesPrune = generateManifestPathsToDbTypeMap(manifest);

    // Pull old tree
    const externalCidMap = await generateExternalCidMap(node.uuid);
    const oldFlatTree = recursiveFlattenTree(await getDirectoryTree(rootCid, externalCidMap)) as RecursiveLsResult[];
    oldFlatTree.push({ cid: rootCid, path: rootCid, name: 'Old Root Dir', type: 'dir', size: 0 });
    // Map paths=>branch for constant lookup
    const OldTreePathsMap: Record<DrivePath, RecursiveLsResult> = oldFlatTree.reduce((map, branch) => {
      map[neutralizePath(branch.path)] = branch;
      return map;
    }, {});

    // External dir check
    pathContainsExternalCids(OldTreePathsMap, contextPath);

    const splitContextPath = contextPath.split('/');
    splitContextPath.shift();
    //rootlessContextPath = how many dags need to be reset, n + 1
    const rootlessContextPath = splitContextPath.join('/');

    // Check if paths are unique
    ensureUniquePaths(OldTreePathsMap, contextPath, files);
  } catch (error) {
    // DB status to failed
    // Socket emit to client
    logger.error('Error processing S3 data to IPFS:', error);
  }
}

export async function ensureSpaceAvailable(files: any[], user: User) {
  let uploadSizeBytes = 0;
  if (files.length) files.forEach((f) => (uploadSizeBytes += f.size));
  // if (externalUrl) uploadSizeBytes += externalUrlTotalSizeBytes;
  const hasStorageSpaceToUpload = await hasAvailableDataUsageForUpload(user, { fileSizeBytes: uploadSizeBytes });
  if (!hasStorageSpaceToUpload)
    throw new Error(
      `upload size of ${uploadSizeBytes} exceeds users data budget of ${user.currentDriveStorageLimitGb} GB`,
    );
  return true;
}

export function extractRootDagCidFromManifest(manifest: ResearchObjectV1, manifestCid: string) {
  const rootCid: string = manifest.components.find((c) => c.type === ResearchObjectComponentType.DATA_BUCKET).payload
    .cid;
  if (!rootCid) throw new Error(`Root DAG not found in manifest, manifestCid: ${manifestCid}`);
  return rootCid;
}

export async function getManifestFromNode(
  node: Node,
  queryString?: string,
): Promise<{ manifest: ResearchObjectV1; manifestCid: string }> {
  const manifestCid = node.manifestUrl || node.cid;
  const manifestUrlEntry = manifestCid ? cleanupManifestUrl(manifestCid as string, queryString as string) : null;

  const fetchedManifest = manifestUrlEntry ? await (await axios.get(manifestUrlEntry)).data : null;
  if (!fetchedManifest) throw new Error(`Error fetching manifest from IPFS, manifestCid: ${manifestCid}`);
  return { manifest: fetchedManifest, manifestCid };
}

export function pathContainsExternalCids(flatTreeMap: Record<DrivePath, RecursiveLsResult>, contextPath: string) {
  // Check if update path contains externals, disable adding to external DAGs
  const pathMatch = flatTreeMap[contextPath];
  if (pathMatch?.external) throw new Error('Cannot update externally added directories');
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
    throw new Error('Duplicate files rejected');
  }
  return true;
}
