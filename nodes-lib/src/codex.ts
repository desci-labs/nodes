import {
  authenticatedCeramicClient,
  createResearchObject,
  newComposeClient,
  updateResearchObject,
  type ComposeClient,
  type NodeIDs,
  queryResearchObject,
  resolveHistory,
} from "@desci-labs/desci-codex-lib/dist/src/index.js";
import type { IndexedNodeVersion, PrepublishResponse } from "./api.js";
import { convertHexToCID } from "./util/converting.js";

/**
 * Publish an object modification to Codex. If it's the initial publish, it will be done
 * onto a new stream. If there is a known existing stream for the object, the update is
 * made through a new commit to the same stream. If there is history, but no known stream,
 * it's backfilled onto a new one.
 *
 * @param prepublishResult - The new modification to publish
 * @param versions - Previous versions of the object, to potentially migrate
 * @param existingStream - A known stream for this object
 * @returns the stream ID of the object
 */
export const codexPublish = async (
  prepublishResult: PrepublishResponse,
  dpidHistory: IndexedNodeVersion[],
  privateKey: string,
): Promise<NodeIDs> => {
  console.log("[DEBUG]::CODEX starting publish...");
  const ceramic = await authenticatedCeramicClient(privateKey);
  const compose = newComposeClient({ ceramic });

  // If we know about a stream already, let's assume we backfilled it initially
  if (prepublishResult.ceramicStream) {
    console.log(`[DEBUG]::CODEX publishing to known stream ${prepublishResult.ceramicStream}...`);
    const ro = await updateResearchObject(compose, {
      id: prepublishResult.ceramicStream,
      title: prepublishResult.updatedManifest.title,
      manifest: prepublishResult.updatedManifestCid,
    });
    console.log(
      `[DEBUG]::CODEX successfully updated ${ro.streamID} with commit ${ro.commitID}`
    );
    return { streamID: ro.streamID, commitID: ro.commitID };
  };

  // Otherwise, create a new stream, potentially backfilling it with
  // earlier updates.
  if (dpidHistory.length === 0) {
    console.log("[DEBUG]::CODEX publishing to new stream...");
    const ro = await createResearchObject(compose, {
      title: prepublishResult.updatedManifest.title || "",
      manifest: prepublishResult.updatedManifestCid,
    });
    console.log(
      `[DEBUG]::CODEX published to new stream ${ro.streamID} with commit ${ro.commitID}`
    );
    return { streamID: ro.streamID, commitID: ro.commitID };
  } else {
    console.log("[DEBUG]::CODEX backfilling new stream to mirror history...");
    const streamID = await backfillNewStream(compose, dpidHistory);
    console.log("[DEBUG]::CODEX backfill done, recursing to append latest event...");
    return await codexPublish(
      { ...prepublishResult, ceramicStream: streamID },
      dpidHistory,
      privateKey
    );
  };
};

/**
 * Migrate a node's history to a stream, by working through the versions chronologically
 * and replaying the manifest versions onto a new stream.
 * @param compose - ComposeDB client instance
 * @param versions - RO history log
 * @returns ID of the new stream
 */
const backfillNewStream = async (
    compose: ComposeClient,
    versions: IndexedNodeVersion[]
): Promise<string> => {
    console.log(
        `[DEBUG]::CODEX starting backfill migration for versions:\n${JSON.stringify(
            versions,
            undefined,
            2
        )}`
    );
    const backfillSequential = async (
        prevPromise: Promise<NodeIDs>,
        nextVersion: IndexedNodeVersion,
        ix: number
    ): Promise<NodeIDs> => {
        const { streamID, commitID } = await prevPromise;
        streamID &&
            console.log(
                `[DEBUG]::CODEX backfilled version ${ix} into ${streamID} with commit ${commitID}`
            );

        const title = "[BACKFILLED]"; // version.title is the title of the event, e.g. "Published"
        const manifest = convertHexToCID(nextVersion.cid);
        const op =
            streamID === ""
                ? createResearchObject(compose, { title, manifest })
                : updateResearchObject(compose, { id: streamID, title, manifest });
        return op;
    };

    const { streamID } = await versions.reduce(
        backfillSequential,
        Promise.resolve({ streamID: "", commitID: "" })
    );
    return streamID;
};

export const getPublishedFromCodex = async (
  id: string
) => {
  const ceramic = await authenticatedCeramicClient(
    process.env.PKEY!
  );

  const compose = newComposeClient({ ceramic });
  return await queryResearchObject(compose, id);
};

export const getCodexHistory = async (
  streamID: string
) => {
  const ceramic = await authenticatedCeramicClient(
    process.env.PKEY!
  );

  return await resolveHistory(ceramic, streamID);
};
