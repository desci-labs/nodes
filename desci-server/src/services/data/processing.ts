import { ResearchObjectComponentType, ResearchObjectV1 } from '@desci-labs/desci-models';
import { User, Node } from '@prisma/client';
import axios from 'axios';

import { cleanupManifestUrl } from 'controllers/nodes';
import parentLogger from 'logger';
import { hasAvailableDataUsageForUpload } from 'services/dataService';

interface ProcessS3DataToIpfsParams {
  files: any[];
  user: User;
}

const logger = parentLogger.child({
  module: 'Services::Processing',
});

export async function processS3DataToIpfs({ files, user }: ProcessS3DataToIpfsParams) {
  try {
    ensureSpaceAvailable(files, user);
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

export async function extractRootDagCidFromManifest(manifest: ResearchObjectV1, manifestCid: string) {
  const rootCid = manifest.components.find((c) => c.type === ResearchObjectComponentType.DATA_BUCKET).payload.cid;
  if (!rootCid) throw new Error(`Root DAG not found in manifest, manifestCid: ${manifestCid}`);
  return { rootCid };
}

export async function getManifestFromNode(node: Node, queryString?: string) {
  const manifestCid = node.manifestUrl || node.cid;
  const manifestUrlEntry = manifestCid ? cleanupManifestUrl(manifestCid as string, queryString as string) : null;

  const fetchedManifest = manifestUrlEntry ? await (await axios.get(manifestUrlEntry)).data : null;
  if (!fetchedManifest) throw new Error(`Error fetching manifest from IPFS, manifestCid: ${manifestCid}`);
  return { manifest: fetchedManifest, manifestCid };
}
