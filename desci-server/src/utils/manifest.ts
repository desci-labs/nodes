import {
  PdfComponent,
  ResearchObjectComponentDocumentSubtype,
  ResearchObjectComponentType,
  ResearchObjectV1,
} from '@desci-labs/desci-models';
import { Node } from '@prisma/client';
import axios from 'axios';

import { prisma } from '../client.js';
import { PUBLIC_IPFS_PATH } from '../config/index.js';
import { logger, logger as parentLogger } from '../logger.js';
import { DEFAULT_TTL, getFromCache, getOrCache, ONE_WEEK_TTL, setToCache } from '../redisClient.js';
import { hexToCid, isCid } from '../utils.js';

const IPFS_RESOLVER_OVERRIDE = process.env.IPFS_RESOLVER_OVERRIDE;

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

/** Resolve manifest given its CID, in either hex or plain-text format */
export const resolveNodeManifest = async (targetCid: string, gateway?: string) => {
  const ipfsResolver = IPFS_RESOLVER_OVERRIDE || gateway || 'https://ipfs.desci.com/ipfs';
  let cidString = targetCid;

  if (!isCid(targetCid)) {
    cidString = hexToCid(targetCid);
  }

  try {
    parentLogger.info(`Calling IPFS Resolver ${ipfsResolver} for CID ${cidString}`);
    const { data } = await axios.get(`${ipfsResolver}/${cidString}`);
    return data;
  } catch (err) {
    // res.status(500).send({ ok: false, msg: 'ipfs uplink failed, try setting ?g= querystring to resolver' });
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

export const cachedGetDpidByUuid = async (uuid: string) => {
  let gateway: string;

  const node = await prisma.node.findFirst({
    where: { uuid },
    select: { manifestUrl: true, manifestDocumentId: true, dpidAlias: true },
  });

  const fnGetDpidFromManifest = async (cid: string) => {
    logger.trace({ cid }, 'fnGetDpidFromManifest');
    const manifest = (await resolveNodeManifest(cid, gateway)) as ResearchObjectV1;
    return manifest.dpid ? parseInt(manifest.dpid.id) : -1;
  };

  if (node.dpidAlias) return node.dpidAlias;

  logger.trace({ node }, 'fnGetDpidFromManifest');
  const manifestDpid = await getOrCache<number>(
    `manifest-dpid-${node.manifestUrl}`,
    fnGetDpidFromManifest.bind(null, node.manifestUrl),
  );
  if (manifestDpid === -1) {
    return undefined;
  } else {
    return manifestDpid;
  }
};

export const cachedGetManifest = async (cid: string, gateway?: string) => {
  let manifest = (await getFromCache(`manifest-${cid}`)) as ResearchObjectV1;

  if (!manifest) {
    manifest = (await resolveNodeManifest(cid, gateway)) as ResearchObjectV1;
    await setToCache(`manifest-${cid}`, manifest, DEFAULT_TTL);
  }
  return manifest;
};

export const cachedGetManifestAndDpid = async (cid: string, gateway?: string) => {
  const manifest = await cachedGetManifest(cid, gateway);
  if (!manifest) return undefined;

  let manifestDpid = manifest.dpid ? parseInt(manifest.dpid.id) : -1;

  if (manifestDpid === -1) {
    manifestDpid = await getFromCache(`manifest-dpid-${cid}`);
    await setToCache(`manifest-dpid-${cid}`, manifest, DEFAULT_TTL);
  }
  return { manifest, dpid: manifestDpid };
};

export const zeropad = (data: string) => (data.length < 2 ? `0${data}` : data);

/**
 * Get the first manuscript from a manifest.
 * Prioritizes in this order:
 * 1. PDF type with MANUSCRIPT subtype
 * 2. PDF type with RESEARCH_ARTICLE subtype
 * 3. PDF type with PREPRINT subtype
 * 4. Any PDF type
 */
export function getFirstManuscript(manifest: ResearchObjectV1) {
  if (!manifest?.components) return null;

  // First priority: MANUSCRIPT subtype
  const manuscriptComponent = manifest.components.find(
    (c) =>
      c?.type === ResearchObjectComponentType.PDF &&
      (c as PdfComponent)?.subtype === ResearchObjectComponentDocumentSubtype.MANUSCRIPT,
  );
  if (manuscriptComponent) return manuscriptComponent;

  // Second priority: RESEARCH_ARTICLE subtype
  const researchArticleComponent = manifest.components.find(
    (c) =>
      c?.type === ResearchObjectComponentType.PDF &&
      (c as PdfComponent)?.subtype === ResearchObjectComponentDocumentSubtype.RESEARCH_ARTICLE,
  );
  if (researchArticleComponent) return researchArticleComponent;

  // Third priority: PREPRINT subtype
  const preprintComponent = manifest.components.find(
    (c) =>
      c?.type === ResearchObjectComponentType.PDF &&
      (c as PdfComponent)?.subtype === ResearchObjectComponentDocumentSubtype.PREPRINT,
  );
  if (preprintComponent) return preprintComponent;

  // Fourth priority: Any PDF type
  const anyPdfComponent = manifest.components.find((c) => c?.type === ResearchObjectComponentType.PDF);

  return anyPdfComponent || null;
}
