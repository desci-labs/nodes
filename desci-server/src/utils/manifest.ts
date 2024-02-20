import { ResearchObjectV1 } from '@desci-labs/desci-models';
import { Node } from '@prisma/client';
import axios from 'axios';

import { PUBLIC_IPFS_PATH } from '../config/index.js';
import { logger as parentLogger } from '../logger.js';
import { hexToCid } from '../utils.js';

const IPFS_RESOLVER_OVERRIDE = process.env.IPFS_RESOLVER_OVERRIDE || '';

export const cleanupManifestUrl = (url: string, gateway?: string) => {
  if (url && (PUBLIC_IPFS_PATH || gateway)) {
    const s = url.split('/');
    const res = `${gateway ? gateway : PUBLIC_IPFS_PATH}/${s[s.length - 1]}`;
    parentLogger.info({ fn: 'cleanupManifestUrl', url, gateway }, `resolving ${url} => ${res}`);
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

export const resolveNodeManifest = async (targetCid: string, query?: string) => {
  const ipfsResolver = IPFS_RESOLVER_OVERRIDE || query || 'https://ipfs.desci.com/ipfs';
  const cidString = hexToCid(targetCid);
  try {
    parentLogger.info(`Calling IPFS Resolver ${ipfsResolver} for CID ${cidString}`);
    const { data } = await axios.get(`${ipfsResolver}/${cidString}`);
    return data;
  } catch (err) {
    // res.status(500).send({ ok: false, msg: 'ipfs uplink failed, try setting ?g= querystring to resolver' });
    return null;
  }
};
