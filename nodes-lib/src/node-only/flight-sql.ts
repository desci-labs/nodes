/**
 * FlightSQL-dependent Codex query functions
 * These functions require native binaries and are only available in Node.js environments
 */
import { getNodesLibInternalConfig } from "../shared/config/index.js";
import { newFlightSqlClient } from "@desci-labs/desci-codex-lib/c1/clients";
import { getStreamHistory } from "@desci-labs/desci-codex-lib/c1/resolve";
import { errWithCause } from "pino-std-serializers";
import {
  newCeramicClient,
  newComposeClient,
  queryResearchObject,
  streams,
  type ResearchObjectHistory,
} from "@desci-labs/desci-codex-lib";

const LOG_CTX = "[nodes-lib::codex-queries]";

/**
 * Get the full state of a research object on Codex, including all history
 */
export const getFullState = async (streamID: string) => {
  const config = getNodesLibInternalConfig();
  const useCeramicOne = config.ceramicOneRpcUrl !== undefined;
  if (useCeramicOne) {
    const client = await newFlightSqlClient(config.ceramicOneFlightUrl);
    let data;
    try {
      data = await getStreamHistory(client, streamID);
    } catch (e) {
      console.error(LOG_CTX, `failed to get stream history for ${streamID}`, {
        err: errWithCause(e as Error),
      });
      throw new Error("codex resolution failed");
    }
    return {
      streamID,
      versions: data.versions,
    };
  } else {
    const ceramic = newCeramicClient(config.ceramicNodeUrl);
    const stream = await streams.loadID(
      ceramic,
      streams.StreamID.fromString(streamID),
    );
    const versions = streams.getVersionLog(stream);
    return {
      streamID,
      versions: versions.map((v) => v.commit.toString()),
    };
  }
};

/**
 * Get the current state of a Codex research object
 */
export const getCurrentState = async (
  streamID: string,
): Promise<ResearchObjectHistory["versions"][number]> => {
  const config = getNodesLibInternalConfig();
  const useCeramicOne = config.ceramicOneRpcUrl !== undefined;
  if (useCeramicOne) {
    const client = await newFlightSqlClient(config.ceramicOneFlightUrl);
    const resolved = await getStreamHistory(client, streamID);
    return resolved.versions.at(-1)!;
  } else {
    const ceramic = newCeramicClient(config.ceramicNodeUrl);
    const compose = newComposeClient({ ceramic });

    const resolved = await queryResearchObject(compose, streamID);
    if (!resolved) {
      throw new Error("codex resolution failed");
    }
    return {
      title: resolved.title || "",
      manifest: resolved.manifest || "",
      version: "0", // ComposeDB doesn't provide version
      time: 0,
      license: resolved.license || "",
    };
  }
};

export const getCodexHistory = async (
  streamID: string,
): Promise<ResearchObjectHistory> => {
  const config = getNodesLibInternalConfig();
  const useCeramicOne = config.ceramicOneRpcUrl !== undefined;

  if (useCeramicOne) {
    const client = await newFlightSqlClient(config.ceramicOneFlightUrl);
    return await getStreamHistory(client, streamID);
  } else {
    const ceramic = newCeramicClient(config.ceramicNodeUrl);
    const stream = await streams.loadID(
      ceramic,
      streams.StreamID.fromString(streamID),
    );
    const versions = streams.getVersionLog(stream);
    return {
      id: streamID,
      owner: stream.state.metadata.controllers[0],
      manifest: stream.state.content.manifest,
      versions: await Promise.all(
        versions.map(async (v) => {
          const state = await streams.loadVersion(ceramic, v.commit);
          return {
            version: v.commit.toString(),
            time: v.timestamp,
            title: state.content.title,
            manifest: state.content.manifest,
            license: state.content.license || "",
          };
        }),
      ),
    };
  }
};
