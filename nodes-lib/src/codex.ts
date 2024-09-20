import {
  createResearchObject,
  newComposeClient,
  updateResearchObject,
  ComposeClient,
  type NodeIDs,
  queryResearchObject,
  resolveHistory,
  newCeramicClient,
  streams,
} from "@desci-labs/desci-codex-lib";
import type { IndexedNodeVersion, PrepublishResponse } from "./api.js";
import { convert0xHexToCid } from "./util/converting.js";
import { getNodesLibInternalConfig } from "./config/index.js";
import { Signer } from "ethers";
import { authorizedSessionDidFromSigner } from "./util/signing.js";
import { type DID } from"dids";
import { CID } from "multiformats";

const LOG_CTX = "[nodes-lib::codex]";
/**
 * Publish an object modification to Codex. If it's the initial publish, it will be done
 * onto a new stream. If there is a known existing stream for the object, the update is
 * made through a new commit to the same stream. If there is history, but no known stream,
 * it's backfilled onto a new one.
 *
 * @param prepublishResult - The new modification to publish
 * @param dpidHistory - Previous versions of the object, to potentially migrate
 * @param didOrSigner - A DID from an authenticated DIDSession, or a signer.
 * @returns the stream ID of the object
 */
export const codexPublish = async (
  prepublishResult: PrepublishResponse,
  dpidHistory: IndexedNodeVersion[],
  didOrSigner: DID | Signer,
): Promise<NodeIDs> => {
  const nodeUrl = getNodesLibInternalConfig().ceramicNodeUrl;
  console.log(LOG_CTX, `starting publish with node ${nodeUrl}...`);

  const ceramic = newCeramicClient(nodeUrl);
  const compose = newComposeClient({ ceramic });

  const existingStreamID = prepublishResult.ceramicStream;

  let controller: string | undefined;
  let controllerChainID: string | undefined;
  if (existingStreamID) {
    const stream = await ceramic.loadStream(existingStreamID);
    controller = stream.state.metadata.controllers[0];
    controllerChainID = controller.match(/eip155:(\d+):/)?.[1]
  };

  if (didOrSigner instanceof Signer) {
    compose.setDID(
      // Wrangle a DID out of the signer for Ceramic auth
      await authorizedSessionDidFromSigner(didOrSigner, compose.resources, controllerChainID)
    );
  } else {
  // NOTE: for a signer we can check and pass the controller EIP155 chainID, but we can't edit that if it's a preauthorized DID
    if (didOrSigner.parent !== controller) {
      console.warn(
        `[nodes-lib::codex] DID and controller mismatch, is the chainID set correctly?`,
        { didParent: didOrSigner.parent, streamController: controller },
      );
    };
    compose.setDID(didOrSigner);
  };

  // If we know about a stream already, let's assume we backfilled it initially
  if (existingStreamID) {
    console.log(LOG_CTX, `publishing to known stream ${existingStreamID}...`);
    const ro = await updateResearchObject(compose, {
      id: existingStreamID,
      title: prepublishResult.updatedManifest.title,
      manifest: prepublishResult.updatedManifestCid,
    });
    console.log(
      `[nodes-lib::codex] successfully updated ${ro.streamID} with commit ${ro.commitID}`
    );
    return { streamID: ro.streamID, commitID: ro.commitID };
  };

  // Otherwise, create a new stream, potentially backfilling it with
  // earlier updates.
  if (dpidHistory.length === 0) {
    console.log(LOG_CTX, "publishing to new stream...");
    const ro = await createResearchObject(compose, {
      title: prepublishResult.updatedManifest.title || "",
      manifest: prepublishResult.updatedManifestCid,
      license: prepublishResult.updatedManifest.defaultLicense || "",
    });
    console.log(
      LOG_CTX,
      `published to new stream ${ro.streamID} with commit ${ro.commitID}`
    );
    return { streamID: ro.streamID, commitID: ro.commitID };
  } else {
    console.log(LOG_CTX, "backfilling new stream to mirror history...");
    const streamID = await backfillNewStream(compose, dpidHistory);

    console.log(LOG_CTX, "backfill done, appending latest event...");
    const ro = await updateResearchObject(compose, {
      id: streamID,
      title: prepublishResult.updatedManifest.title,
      manifest: prepublishResult.updatedManifestCid,
    });
    console.log(
      `[nodes-lib::codex] successfully updated ${ro.streamID} with commit ${ro.commitID}`
    );
    return { streamID: ro.streamID, commitID: ro.commitID };
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
    LOG_CTX,
    `starting backfill migration for versions:\n${JSON.stringify(
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
        LOG_CTX,
        `backfilled version ${ix} into ${streamID} with commit ${commitID}`
      );

    const title = "[BACKFILLED]"; // version.title is the title of the event, e.g. "Published"
    const license = "[BACKFILLED]";

    // When pulling history from new contract legacy entries, the CID
    // is cleartext. Otherwise, it needs to be decoded from hex.
    let manifest: string;
    try {
      // If this works, it was a plaintext CID
      manifest = CID.parse(nextVersion.cid).toString();
    } catch (e) {
      // Otherwise, fall back to hex decoding old style representation
      console.log(LOG_CTX, `got non-plaintext CID for backfill: ${nextVersion.cid}`);
      manifest = convert0xHexToCid(nextVersion.cid);
    };

    const op =
      streamID === ""
        ? createResearchObject(compose, { title, manifest, license })
        : updateResearchObject(compose, { id: streamID, title, manifest });
    return op;
  };

  const { streamID } = await versions.reduce(
    backfillSequential,
    Promise.resolve({ streamID: "", commitID: "" })
  );
  return streamID;
};

/**
 * Get full historical publish state of a research object.
*/
export const getFullState = async (
  streamID: string,
) => {
  const ceramic = newCeramicClient(getNodesLibInternalConfig().ceramicNodeUrl);
  const compose = newComposeClient({ ceramic });
  const resolved = await queryResearchObject(
    compose,
    streamID,
    "owner { id } manifest"
  ) as unknown as { owner: { id: string }, manifest: string};

  console.log(JSON.stringify(resolved))

  if (!resolved) {
    console.log("Failed to resolve research object:", { streamID });
    throw new Error("codex resolution failed");
  };

  const events = await getCodexHistory(streamID);
  return {
    owner: resolved.owner, // explicitly selected in query
    manifest: resolved.manifest, // explicitly selected in query
    events,
  };
};

/**
 * Get the state of a research object as published on Codex.
*/
export const getCurrentState = async (
  streamID: string
) => {
  const ceramic = newCeramicClient(getNodesLibInternalConfig().ceramicNodeUrl);
  const compose = newComposeClient({ ceramic });

  return await queryResearchObject(compose, streamID);
};

/**
 * Get the historical events for a given stream.
*/
export const getCodexHistory = async (
  streamID: string
) => {
  const ceramic = newCeramicClient(getNodesLibInternalConfig().ceramicNodeUrl);
  return await resolveHistory(ceramic, streamID);
};

/**
 * Get the raw stream state for a streamID.
*/
export const getRawState = async (
  streamID: string
) => {
  const ceramic = newCeramicClient(getNodesLibInternalConfig().ceramicNodeUrl);
  return await streams.loadID(ceramic, streams.StreamID.fromString(streamID));
};
