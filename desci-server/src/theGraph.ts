import axios from 'axios';

import { prisma } from './client.js';
import { logger as parentLogger } from './logger.js';
import { getCommitTimestamps } from './services/ceramic.js';
import { getTargetDpidUrl } from './services/fixDpid.js';
import { convertCidTo0xHex, decodeBase64UrlSafeToHex, ensureUuidEndsWithDot } from './utils.js';

const logger = parentLogger.child({
  module: 'GetIndexedResearchObjects',
});

const RESOLVER_URL = process.env.DPID_URL_OVERRIDE || getTargetDpidUrl();

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
  /** Version timestamp, if commit has been anchored yet */
  time?: string;
};

/**
 * Get the indexed (published) history for of some given node UUID(s).
 *
 * Note: This method does not preserve order between param and return array
 * when it needs to union legacy and stream based lookups.
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
  _urlSafeBase64s: string[],
): Promise<{ researchObjects: IndexedResearchObject[] }> => {
  const paddedUuids = _urlSafeBase64s.map(ensureUuidEndsWithDot);

  // Get known nodes for each UUID
  const nodeRes = await prisma.node.findMany({
    select: {
      uuid: true,
      ceramicStream: true,
    },
    where: {
      uuid: {
        in: paddedUuids,
      },
    },
  });

  /**
  For stream resolution, build a map to allow for also returning the UUID
  to match the format returned by the graph lookup
  */
  let streamLookupMap: Record<string, string> = {};
  /** For legacy nodes, the graph lookup only needs the UUID */
  const legacyUuids = [];

  // Bin the UUIDs for resolution depending on DB matching
  for (const uuid of paddedUuids) {
    const matchingDbNode = nodeRes.find((n) => (n.uuid = uuid));
    if (matchingDbNode === undefined) {
      // Either:
      // - old node missing DB UUID
      // - created outside Nodes
      legacyUuids.push(uuid);
    } else if (matchingDbNode.ceramicStream === null) {
      // Either:
      // - unpublished
      // - not migrated to stream
      legacyUuids.push(uuid);
    } else {
      // We had a stream on record for this node, attach hex converted UUID
      streamLookupMap[matchingDbNode.ceramicStream] = `0x${decodeBase64UrlSafeToHex(uuid)}`;
    }
  }

  /**
   * fallback to _getIndexedResearchObjects() when resolving locally
   * because calls to getHistoryFromStreams() never returns due to
   * RESOLVER_URL not configured for local dpid resolution
   */
  if (process.env.NODE_ENV === 'dev') {
    legacyUuids.push(...paddedUuids);
    streamLookupMap = {};
  }

  let streamHistory = [];
  if (Object.keys(streamLookupMap).length > 0) {
    logger.info({ streamLookupMap }, 'Querying resolver for history');
    streamHistory = await getHistoryFromStreams(streamLookupMap);
    logger.info({ streamHistory }, 'Resolver history for nodes found');
  }

  let legacyHistory = [];
  if (legacyUuids.length > 0) {
    logger.info({ legacyUuids }, 'Falling back to subgraph query for history');
    legacyHistory = (await _getIndexedResearchObjects(legacyUuids)).researchObjects;
    logger.info({ legacyHistory }, 'Subgraph history for nodes found');
  }

  return {
    researchObjects: [...streamHistory, ...legacyHistory],
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

/**
 * This function emulates the format returned by the old subgraph, which
 * is what motivates the conversions to hex and the inclusion of the UUIDs.
 */
const getHistoryFromStreams = async (streamToHexUuid: Record<string, string>): Promise<IndexedResearchObject[]> => {
  const historyRes = await axios.post<ResolverIndexResult[]>(`${RESOLVER_URL}/api/v2/query/history`, {
    ids: Object.keys(streamToHexUuid),
  });

  let indexedHistory: IndexedResearchObject[];
  try {
    // Convert resolver format to server format
    indexedHistory = historyRes.data.map((ro) => ({
      id: streamToHexUuid[ro.id],
      id10: BigInt(streamToHexUuid[ro.id]).toString(),
      streamId: ro.id,
      owner: ro.owner,
      recentCid: convertCidTo0xHex(ro.manifest),
      versions: ro.versions
        .map((v) => ({
          cid: convertCidTo0xHex(v.manifest),
          // No transaction ID exists
          id: undefined,
          commitId: v.version,
          // Undefined if the commit hasn't been anchored
          time: v.time?.toString(),
        }))
        .toReversed(), // app expects latest first
    }));
  } catch (e) {
    logger.error({ fn: 'getHistoryFromStreams', data: historyRes.data, error: e });
    throw e;
  }

  return indexedHistory;
};

/** @deprecated but used as fallback for resolver-based index lookup */
export const _getIndexedResearchObjects = async (
  urlSafe64s: string[],
): Promise<{ researchObjects: IndexedResearchObject[] }> => {
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

/**
 * For a bunch of publish hashes, get the corresponding timestamps as strings.
 */
export const getTimeForTxOrCommits = async (txOrCommits: string[]): Promise<Record<string, string>> => {
  const isTx = (id: string) => id.startsWith('0x');
  const txIds = txOrCommits.filter(isTx);
  const commitIdStrs = txOrCommits.filter((id) => !isTx(id));

  const commitTimeMap = await getCommitTimestamps(commitIdStrs);
  const txTimeMap = await getTxTimestamps(txIds);

  return { ...commitTimeMap, ...txTimeMap };
};

/**
 * Get the timestamp for a list of research object publish transactions.
 * @returns a map between { txId: timestamp }
 */
const getTxTimestamps = async (txIds: string[]): Promise<Record<string, string>> => {
  if (txIds.length === 0) {
    return {};
  }

  try {
    const graphTxTimestamps = await getTxTimeFromGraph(txIds);
    const timeMap = graphTxTimestamps.reduce(
      (acc, { id, time }) => ({ ...acc, [id]: time }),
      {} as Record<string, string>,
    );
    return timeMap;
  } catch (err) {
    logger.error({ txIds, err }, 'failed to get tx timestamps from graph, returning empty map');
    return {};
  }
};

type TransactionsWithTimestamp = {
  researchObjectVersions: { id: string; time: string }[];
};

const getTxTimeFromGraph = async (txIds: string[]): Promise<TransactionsWithTimestamp['researchObjectVersions']> => {
  const q = `
  {
    researchObjectVersions(where: {id_in: ["${txIds.join('","')}"]}) {
      id
      time
    }
  }`;
  const response = await query<TransactionsWithTimestamp>(q);
  return response.researchObjectVersions;
};

type RegisterEvent = {
  transactionHash: string;
  entryId: string;
};

type DpidRegistersResponse = {
  registers: RegisterEvent[];
};

/**
 * Find the legacy dPID for a given node by looking up a transaction hash,
 * as the graph doesn't index dPIDs by UUID.
 * @deprecated
 */
export const _getDpidForTxIds = async (txs: string[]): Promise<RegisterEvent[]> => {
  logger.info({ txs }, "Getting legacy dpid's for transactions");
  // Usually called with way less arguments, but 500 will prevent very odd errors as it will always  include all dpids
  const q = `
  {
    registers(
      first: 500
      where: {
        transactionHash_in: ["${txs.join('","')}"],
      }
      orderBy: entryId
    ) {
      transactionHash
      entryId
    }
  }`;
  console.log('Sending graph query:', { q });
  const url = process.env.THEGRAPH_API_URL.replace('name/nodes', 'name/dpid-registry');
  const response = await query<DpidRegistersResponse>(q, url);
  return response.registers;
};

export const query = async <T>(query: string, overrideUrl?: string): Promise<T> => {
  const payload = JSON.stringify({
    query,
  });
  const url = overrideUrl ?? process.env.THEGRAPH_API_URL;
  const { data } = await axios.post(url, payload);
  if (data.errors) {
    logger.error({ fn: 'query', err: data.errors, query, dataRes: data }, `graph index query err ${query}`);
    throw Error(JSON.stringify(data.errors));
  }
  return data.data as T;
};
