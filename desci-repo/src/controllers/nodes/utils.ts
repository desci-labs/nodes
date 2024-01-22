import axios from 'axios';
import { ResearchObjectV1 } from '@desci-labs/desci-models';
import { prisma } from '../../client.js';
import { Node } from '@prisma/client';
import { PUBLIC_IPFS_PATH } from '../../config.js';
import { logger as parentLogger } from '../../logger.js';

export async function getLatestManifest(
  nodeUuid: string,
  resolver: string,
  node?: Node,
): Promise<ResearchObjectV1 | null> {
  parentLogger.info({ nodeUuid, resolver, node }, 'Start Node latest manifest');
  node = node || (await prisma.node.findUnique({ where: { uuid: nodeUuid } }));
  const latestManifestCid = node.manifestUrl || node.cid;
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
