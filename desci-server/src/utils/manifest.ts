import { ResearchObjectV1 } from '@desci-labs/desci-models';
import { Node } from '@prisma/client';
import axios from 'axios';
import { errWithCause } from 'pino-std-serializers';

import { PUBLIC_IPFS_PATH } from '../config/index.js';
import { logger as parentLogger } from '../logger.js';
import { getOrCache } from '../redisClient.js';
import { hexToCid, isCid } from '../utils.js';

const logger = parentLogger.child({
  module: 'utils:manifest.ts',
});

const IPFS_RESOLVER_OVERRIDE = process.env.IPFS_RESOLVER_OVERRIDE;

export const cleanupManifestUrl = (url: string, gateway?: string) => {
  if (url && (PUBLIC_IPFS_PATH || gateway)) {
    const s = url.split('/');
    const res = `${gateway ? gateway : PUBLIC_IPFS_PATH}/${s[s.length - 1]}`;
    logger.info({ fn: 'cleanupManifestUrl', url, gateway }, `resolving ${url} => ${res}`);
    return res;
  }
  return url;
};

export const transformManifestWithHistory = (data: ResearchObjectV1, researchNode: Node) => {
  const ro = Object.assign({}, data);
  if (!ro.history || !ro.history.length) {
    const body = JSON.parse(researchNode.restBody as string);
    const hasMetadata = body.links.pdf[0]?.indexOf('data:') < 0;
    const rest = Object.assign({}, body);

    if (!hasMetadata) {
      rest.links.pdf = null;
      delete rest.links.pdf;
    }
  }
  return ro;
};

/** Resolve manifest given its CID, in either hex or plain-text format */
export const resolveNodeManifest = async (targetCid: string, gateway?: string) => {
  const ipfsResolver = IPFS_RESOLVER_OVERRIDE || gateway || 'https://ipfs.desci.com/ipfs';
  let cidString = targetCid;

  if (!isCid(targetCid)) {
    cidString = hexToCid(targetCid);
  }

  try {
    logger.info(`Calling IPFS Resolver ${ipfsResolver} for CID ${cidString}`);
    const { data } = await axios.get(`${ipfsResolver}/${cidString}`);
    return data;
  } catch (err) {
    logger.error({ err: errWithCause(err) }, 'Failed to call IPFS resolver');
    return null;
  }
};

export const cachedGetDpidFromManifest = async (cid: string, gateway?: string) => {
  const fnGetDpidFromManifest = async () => {
    const manifest = (await resolveNodeManifest(cid, gateway)) as ResearchObjectV1;
    return manifest.dpid ? parseInt(manifest.dpid.id) : -1;
  };

  const manifestDpid = await getOrCache(`manifest-dpid-${cid}`, fnGetDpidFromManifest);
  if (manifestDpid === -1) {
    return undefined;
  } else {
    return manifestDpid;
  }
};

export const zeropad = (data: string) => (data.length < 2 ? `0${data}` : data);
