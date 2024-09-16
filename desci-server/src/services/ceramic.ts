import axios, { AxiosError } from "axios";
import { CERAMIC_API_URL } from "../config/index.js";
import { logger as parentLogger } from "../logger.js";
import { CommitID } from "@desci-labs/desci-codex-lib/dist/streams.js";

const logger = parentLogger.child({
  module: "Service::Ceramic",
});

const DESCI_STREAM_API = CERAMIC_API_URL + "/api/v0/streams/";

export type RawState = {
  content: { title: string, license: string, manifest: string },
  metadata: {
    /** Single-element array with fully qualified EIP155 address */
    controllers: string[],
    /** StreamID of model schema */
    model: string,
    /** Client randomness for stream uniqueness */
    unique: string,
  },
  /** Signing status. 0 is genesis, 2 is signed */
  signature: number,
  /** Likely: NOT_REQUESTED, PENDING, ANCHORED
   *  Unlikely: PROCESSING, FAILED, REPLACED
  */
  anchorStatus: string,
  log: LogEntry[],
  anchorProof: any,
  doctype: "MID",
};

export type LogEntry = {
  /** Commit CID */
  cid: string,
  /** 0 is genesis, 1 is data (update), 2 is anchor */
  type: number,
  /** On 0 and 1: expiration time of CACAO JWT, anchor must be made before this */
  expirationTime?: number,
  /** Time of anchoring */
  timestamp?: number,
};

export type RawStream = {
  streamId: string,
  state: RawState,
};

export const directStreamLookup = async (stream: string) => {
  let result: { data: RawStream };
  try {
    // sync=2 => ask the node to return whatever it already knows, not query the p2p network on-demand
    // https://developers.ceramic.network/reference/typescript/enums/_ceramicnetwork_common.SyncOptions.html
    result = await axios.get<RawStream>(DESCI_STREAM_API + stream + '?sync=2');
  } catch (e) {
    const err = e as AxiosError;
    return {
      err: err.name,
      status: err.response?.status,
      body: err.response?.data,
      msg: err.message,
      cause: err.cause,
      stack: err.stack,
    };
  };
  return result.data;
};

/**
 * Get the anchor timestamp, if any, for each commitID.
 *
 * When we just need the timestamp for commits (e.g., `getTreeAndFill`), it's unnecessary
 * to compute all historical states as this info is part of the raw stream event log
 * present in the state.
 *
 * TODO: resolver should probably support raw resolution and/or timestamp lookups
 *
 * @returns a map between { commitIdStr: timestamp} if successful, empty map otherwise
 */
export const getCommitTimestamps = async (
  commitIdStrs: string[]
): Promise<Record<string, string>> => {
  if (commitIdStrs.length === 0) {
    return {};
  }

  logger.debug({ fn: 'getCommitTimestamps', commitIdStrs }, "getting timestamps");
  const firstCommitId = CommitID.fromString(commitIdStrs[0]);
  const streamId = firstCommitId.baseID;
  const streamState = await directStreamLookup(streamId.toString());

  if ('err' in streamState) {
    logger.warn(
      { fn: 'getCommitTimestamps', streamId: streamId.toString() },
      'failed to load stream, returning empty map',
    );
    return {};
  };

  const rawLog = streamState.state.log;
  const timeMap = rawLog.reduce(
    (acc, logEvent) => ({
      ...acc,
      [CommitID.make(streamId, logEvent.cid).toString()]: logEvent.timestamp?.toString()
    }),
    {} as Record<string, string>
  );

  logger.debug({ fn: 'getCommitTimestamps', timeMap }, "returning timestamps");
  return timeMap;
};
