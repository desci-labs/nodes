import {
  authenticatedCeramicClient,
  createResearchObject,
  newComposeClient,
  updateResearchObject,
  type ComposeClient,
  type NodeIDs,
  queryResearchObject
} from "@desci-labs/desci-codex-lib/dist/src/index.js";
import type { ResearchObjectV1History } from "@desci-labs/desci-models";
import type { PrepublishResponse } from "./api.js";

export type History = {
  /** Known existing stream for this node */
  existingStream?: string,
  /** Previous versions according to desci-nodes */
  versions: ResearchObjectV1History[],
};

/**
 * Publish an object modification to Ceramic. If it's the initial publish, it will be done
 * onto a new stream. If there is a known existing stream for the object, the update is
 * made through a new commit to the same stream. If there is history, but no known stream,
 * it's backfilled onto a new one.
 *
 * @param modifiedObject - The new modification to publish
 * @param versions - Previous versions of the object, to potentially migrate
 * @param existingStream - A known stream for this object
 * @returns the stream ID of the object
 */
export const ceramicPublish = async (
  modifiedObject: PrepublishResponse,
  history: History,
  privateKey: string,
): Promise<NodeIDs> => {
  console.log("[DEBUG]::CERAMIC starting publish...");
  const ceramic = await authenticatedCeramicClient(privateKey);
  const compose = newComposeClient({ ceramic });

  if (history.existingStream) {
    console.log(`[DEBUG]::CERAMIC publishing to known stream ${history.existingStream}...`);
    const ro = await updateResearchObject(compose, {
      id: history.existingStream,
      title: modifiedObject.updatedManifest.title,
      manifest: modifiedObject.updatedManifestCid,
    });
    console.log(
      `[DEBUG]::CERAMIC successfully updated ${ro.streamID} with commit ${ro.commitID}`
    );
    return { streamID: ro.streamID, commitID: ro.commitID };
  };

  if (history.versions.length === 0) {
    console.log("[DEBUG]::CERAMIC publishing to new stream...");
    const ro = await createResearchObject(compose, {
      title: modifiedObject.updatedManifest.title || "",
      manifest: modifiedObject.updatedManifestCid,
    });
    console.log(
      `[DEBUG]::CERAMIC published to new stream ${ro.streamID} with commit ${ro.commitID}`
    );
    return { streamID: ro.streamID, commitID: ro.commitID };
  } else {
    console.log("[DEBUG]::CERAMIC backfilling new stream to mirror history...");
    const streamID = await backfillNewStream(compose, history.versions);
    console.log("[DEBUG]::CERAMIC backfill done, recursing to append latest event...");
    return await ceramicPublish(
      modifiedObject,
      { existingStream: streamID, versions: history.versions },
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
    versions: ResearchObjectV1History[]
): Promise<string> => {
    console.log(
        `[DEBUG]::CERAMIC starting backfill migration for versions:\n${JSON.stringify(
            versions,
            undefined,
            2
        )}`
    );
    const backfillSequential = async (
        prevPromise: Promise<NodeIDs>,
        nextVersion: ResearchObjectV1History,
        ix: number
    ): Promise<NodeIDs> => {
        const { streamID, commitID } = await prevPromise;
        streamID &&
            console.log(
                `[DEBUG]::CERAMIC backfilled version ${ix} into ${streamID} with commit ${commitID}`
            );

        const title = "[BACKFILLED]"; // version.title is the title of the event, e.g. "Published"
        const manifest = nextVersion.transaction!.cid;
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

export const getPublishedFromCeramic = async (
  id: string
) => {
  const ceramic = await authenticatedCeramicClient(
    process.env.PKEY!
  );

  const compose = newComposeClient({ ceramic });
  return await queryResearchObject(compose, id);
}
