import axios, { AxiosError } from "axios";
import { CERAMIC_API_URL } from "../config/index.js";
import { logger as parentLogger } from "../logger.js";
import { newCeramicClient, resolveHistory } from "@desci-labs/desci-codex-lib";

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
  timestamp: number,
};

export type RawStream = {
  streamId: string,
  state: RawState,
};

export const directStreamLookup = async (stream: string) => {
  let result: { data: RawStream };
  try {
    result = await axios.get<RawStream>(DESCI_STREAM_API + stream);
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
