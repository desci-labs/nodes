import { ResearchObjectV1 } from '@desci-labs/desci-models';
import axios from 'axios';

import { PUBLIC_IPFS_PATH } from '../../config.js';
import { findNodeByUuid } from '../../db/index.js';
import { createIpfsUnresolvableError } from '../../lib/errors.js';
import { logger as parentLogger } from '../../logger.js';
import { Node } from '../../middleware/guard.js';

export async function getLatestManifest(
  nodeUuid: string,
  resolver: string,
  node?: Node,
): Promise<ResearchObjectV1 | null> {
  parentLogger.info({ nodeUuid, resolver, node }, 'Start Node latest manifest');
  node = node || (await findNodeByUuid(nodeUuid)); // (await prisma.node.findUnique({ where: { uuid: nodeUuid } }));
  const latestManifestCid = node?.manifestUrl || node?.cid;
  const manifestUrl = latestManifestCid ? cleanupManifestUrl(latestManifestCid as string, resolver as string) : null;
  return manifestUrl ? await (await axios.get(manifestUrl)).data : null;
}

export const cleanupManifestUrl = (url: string, gateway?: string) => {
  if (url && (PUBLIC_IPFS_PATH || gateway)) {
    const s = url.split('/');
    const res = `${gateway ? gateway : PUBLIC_IPFS_PATH}/${s[s.length - 1]}`;
    parentLogger.info({ fn: 'cleanupManifestUrl', url, gateway }, `resolving ${url} => ${res}`);
    return res;
  }
  return url;
};

export async function getManifestFromNode(
  node: Node,
  queryString?: string,
): Promise<{ manifest: ResearchObjectV1; manifestCid: string }> {
  // debugger;
  const manifestCid = node.manifestUrl || node.cid;
  const manifestUrlEntry = manifestCid ? cleanupManifestUrl(manifestCid as string, queryString as string) : null;
  try {
    const fetchedManifest = manifestUrlEntry ? await (await axios.get(manifestUrlEntry)).data : null;
    return { manifest: fetchedManifest, manifestCid };
  } catch (e) {
    throw createIpfsUnresolvableError(`Error fetching manifest from IPFS, manifestCid: ${manifestCid}`);
  }
}

export function ensureUuidEndsWithDot(uuid: string): string {
  return uuid.endsWith('.') ? uuid : uuid + '.';
}
