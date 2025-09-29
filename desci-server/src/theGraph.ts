import axios from 'axios';

import { prisma } from './client.js';
import { logger as parentLogger } from './logger.js';
import { getCommitTimestamps } from './services/codex.js';
import { getTargetDpidUrl } from './services/fixDpid.js';
import { convertCidTo0xHex, decodeBase64UrlSafeToHex, ensureUuidEndsWithDot } from './utils.js';
import { getTransactionTimestamps } from './services/chain.js';

const logger = parentLogger.child({
  module: 'GetIndexedResearchObjects',
});

const DPID_RESOLVER_URL = process.env.DPID_URL_OVERRIDE || getTargetDpidUrl();

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
      legacyDpid: true,
      dpidAlias: true,
    },
    where: {
      uuid: {
        in: paddedUuids,
      },
    },
  });

  /**
  For dpid resolution, build a map to allow for also returning the UUID
  to match the format returned by the graph lookup
  */
  const dpidLookupMap: Record<number, string> = nodeRes.reduce(
    (acc, n) => {
      const dpid = n.dpidAlias ?? n.legacyDpid;
      if (dpid != null) {
        acc[dpid] = n.uuid;
      }
      return acc;
    },
    {} as Record<number, string>,
  );

  const researchObjects = await getHistoryFromDpids(dpidLookupMap);
  return { researchObjects };
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
const getHistoryFromDpids = async (dpidsToUuidsMap: Record<number, string>): Promise<IndexedResearchObject[]> => {
  // If no DPIDs to query, return empty array to handle brand new nodes
  // that haven't been published yet and have no DPID information
  if (Object.keys(dpidsToUuidsMap).length === 0) {
    logger.info({ fn: 'getHistoryFromDpids' }, 'No DPIDs to query, returning empty array for new nodes');
    return [];
  }

  const historyRes = await axios.post<ResolverIndexResult[]>(`${DPID_RESOLVER_URL}/api/v2/query/history`, {
    ids: Object.keys(dpidsToUuidsMap),
  });

  const uuids = Object.values(dpidsToUuidsMap);
  let indexedHistory: IndexedResearchObject[];
  try {
    // Convert resolver format to server format
    indexedHistory = historyRes.data.map((ro, index) => ({
      id: '0x' + decodeBase64UrlSafeToHex(uuids[index]),
      id10: BigInt('0x' + decodeBase64UrlSafeToHex(uuids[index])).toString(),
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

/**
 * For a bunch of publish hashes, get the corresponding timestamps as strings.
 */
export const getTimeForTxOrCommits = async (txOrCommits: string[]): Promise<Record<string, string>> => {
  if (!txOrCommits) {
    logger.error(
      { fn: 'getTimeForTxOrCommits', txOrCommits },
      'Empty txOrCommits passed in, expecting a string or array of strings.',
    );
  }
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
    return await getTransactionTimestamps(txIds);
  } catch (err) {
    logger.error({ txIds, err }, 'failed to get tx timestamps from graph, returning empty map');
    return {};
  }
};
