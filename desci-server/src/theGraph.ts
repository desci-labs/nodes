/**
 * Query The Graph subgraph
 */

import axios from 'axios';

import { logger as parentLogger } from './logger.js';
import { convertCidTo0xHex, decodeBase64UrlSafeToHex, ensureUuidEndsWithDot } from './utils.js';
import { prisma } from './client.js';
import { getTargetDpidUrl } from './services/fixDpid.js';

const logger = parentLogger.child({
  module: "GetIndexedResearchObjects",
});

const RESOLVER_URL = process.env.DPID_URL_OVERRIDE
  || getTargetDpidUrl();

export type IndexedResearchObject = {
  /** Hex: Node UUID */
  id: string;
  /** BigInt string: Node UUID */
  id10: string;
  /** Plain text: StreamID of this research object */
  streamId?: string;
  /** Hex: Owner address */
  owner: string;
  /** Hex: CID of latest manifest version */
  recentCid: string;
  /** Historical information */
  versions: IndexedResearchObjectVersion[];
};

export type IndexedResearchObjectVersion = {
  /** Hex: Manifest CID for this version */
  cid: string;
  /** Hex: Transaction ID for this version (legacy contract)*/
  id?: string;
  /** Plain text: CommitID for this version (ceramic) */
  commitId?: string;
  /** Version timestamp */
  time: string;
};

/**
 * Get the indexed (published) history for of some given node UUID(s).
 *
 * Most of the (temporary) mess here stems from following reasons:
 * - TheGraph returns all strings hex encoded, and even though the resolver
 *   returns them plain we re-encode to hex to be backward compatible
 * - To keep the API of this widely-used function it takes UUID's, even though
 *   the resolver and new contracts only know about dPID and streamIDs.
 * - Before nodes have been migrated, they are missing this streamID so we need
 *   to query them by token ID with TheGraph
 *
 * TODO: cleanse the terrors, i.e. start returning plain CID's and drop the
 * transaction ID's completely, and simplify all uses of this data
*/
export const getIndexedResearchObjects = async (
  urlSafeBase64s: string[]
): Promise<{ researchObjects: IndexedResearchObject[] }> => {
  // Get known streamIDs for node UUID's
  const nodeRes = await prisma.node.findMany({
    select: {
      uuid: true,
      ceramicStream: true,
    },
    where: {
      uuid: {
        in: urlSafeBase64s.map(ensureUuidEndsWithDot),
      },
    },
  });

  // 1. These (upgraded nodes) we can resolve normally
  const nodesWithStream = nodeRes.filter(n => !!n.ceramicStream);

  // Create stream to hex UUID lookup mapping
  const streamToHexUuid: Record<string, string> = nodesWithStream.reduce(
    (mapping, { ceramicStream, uuid }) => ({
      ...mapping,
      [ceramicStream]: `0x${decodeBase64UrlSafeToHex(uuid)}`,
    }),
    {},
  );

  let streamHistory = [];
  if (nodesWithStream.length > 0) {
    logger.info({ nodesWithStream }, "Querying resolver for history");
    streamHistory = await getHistoryFromStreams(streamToHexUuid);
    logger.info({ streamHistory }, "Resolver history for nodes found");
  };

  // 2. These are simplest to fallback to graph lookup as we don't have the dPID handy
  const nodesWithoutStream = nodeRes
    .filter(n => !n.ceramicStream)
    .map(n => n.uuid);

  let legacyHistory = [];
  if (nodesWithoutStream.length > 0) {
    logger.info({ nodesWithoutStream }, "Falling back to subgraph query for history");
    legacyHistory = (await _getIndexedResearchObjects(nodesWithoutStream))
      .researchObjects;
    logger.info({ legacyHistory }, "Subgraph history for nodes found");
  };

  return {
    researchObjects: [...streamHistory, ...legacyHistory]
  };
};

/** Resolver return type for history queries. Needs some massage to fit
 * the backward-compatible data structure used for TheGraph queries.
 *
 * Notably, these results are in plain text but the subgraph data
 * consumers expect most stuff to be in hex.
*/
type ResolverIndexResult = {
  /** Plain text: Stream ID */
  id: string;
  /** Plain text: Fully qualified DID, i.e. did:pkh:eip155:1337:0xabc... */
  owner: string;
  /** Plain text: Most recent manifest CID */
  manifest: string;
  versions: {
    /** Plain text: Commit ID */
    version: string;
    /** Anchor time of this version */
    time: number;
    /** Plain text: Manifest CID for this version */
    manifest: string;
  }[];
};

const getHistoryFromStreams = async (
  streamToHexUuid: Record<string, string>
): Promise<IndexedResearchObject[]> => {
  const historyRes = await axios.post<ResolverIndexResult[]>(
    `${RESOLVER_URL}/api/v2/query/history`,
    { ids: Object.keys(streamToHexUuid) },
  );

  // Convert resolver format to server format
  const indexedHistory: IndexedResearchObject[] = historyRes.data.map(ro => ({
    id: streamToHexUuid[ro.id],
    id10: BigInt(streamToHexUuid[ro.id]).toString(),
    streamId: ro.id,
    owner: ro.owner,
    recentCid: convertCidTo0xHex(ro.manifest),
    versions: ro.versions.map(v => ({
      cid: convertCidTo0xHex(v.manifest),
      // No transaction ID exists
      id: undefined,
      commitId: v.version,
      time: v.time.toString(),
    })).toReversed(), // app expects latest first
  }));

  return indexedHistory;
};

/** @deprecated but used as fallback for resolver-based index lookup */
export const _getIndexedResearchObjects = async (
  urlSafe64s: string[]
): Promise<{ researchObjects: IndexedResearchObject[]}> => {
  const hex = urlSafe64s.map(decodeBase64UrlSafeToHex).map((h) => `0x${h}`);
  logger.info({ hex, urlSafe64s }, 'getIndexedResearchObjects');
  const q = `{
    researchObjects(where: { id_in: ["${hex.join('","')}"]}) {
      id, id10, recentCid, owner, versions(orderBy: time, orderDirection: desc) {
        cid, id, time
      }
    } 
  }`;
  return query(q);
};

export const query = async (query: string) => {
  const payload = JSON.stringify({
    query,
  });
  const { data } = await axios.post(process.env.THEGRAPH_API_URL, payload);
  if (data.errors) {
    logger.error({ fn: 'query', err: data.errors, query, dataRes: data }, `graph index query err ${query}`);
    throw Error(JSON.stringify(data.errors));
  }
  return data.data;
};

