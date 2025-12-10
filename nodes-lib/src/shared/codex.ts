import {
  createResearchObject,
  newComposeClient,
  updateResearchObject,
  ComposeClient,
  type NodeIDs,
  newCeramicClient,
  streams,
} from "@desci-labs/desci-codex-lib";
import type { IndexedNodeVersion, PrepublishResponse } from "./api.js";
import { convert0xHexToCid } from "./util/converting.js";
import { getNodesLibInternalConfig } from "./config/index.js";
import { Signer } from "ethers";
import {
  authorizedSessionDidFromSigner,
  getCacaoResources,
} from "./util/signing.js";
import { type DID } from "dids";
import { CID } from "multiformats";
import { PublishError } from "./errors.js";
import { errWithCause } from "pino-std-serializers";
import { newStreamClient } from "@desci-labs/desci-codex-lib/c1/streamclient";
import {
  updateResearchObject as updateResearchObjectC1,
  createResearchObject as createResearchObjectC1,
} from "@desci-labs/desci-codex-lib/c1/mutate";
import { sleep } from "./util/sleep.js";

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
  const config = getNodesLibInternalConfig();
  const useCeramicOne = config.ceramicOneRpcUrl !== undefined;

  if (useCeramicOne) {
    return codexPublishC1(prepublishResult, dpidHistory, didOrSigner);
  } else {
    return codexPublishComposeDB(prepublishResult, dpidHistory, didOrSigner);
  }
};

const codexPublishC1 = async (
  prepublishResult: PrepublishResponse,
  dpidHistory: IndexedNodeVersion[],
  didOrSigner: DID | Signer,
) => {
  const { ceramicOneRpcUrl } = getNodesLibInternalConfig();
  console.log(LOG_CTX, `starting C1 publish with node ${ceramicOneRpcUrl}...`);

  const client = newStreamClient({ ceramic: ceramicOneRpcUrl });
  const existingStreamID = prepublishResult.ceramicStream;

  let controller: string | undefined;
  let controllerChainID: string | undefined;
  if (existingStreamID) {
    const stream = await client.getStreamState(existingStreamID);
    controller = stream.controller;
    controllerChainID = controller.match(/eip155:(\d+):/)!.at(1);
  }

  let did: DID;
  if (didOrSigner instanceof Signer) {
    did = await authorizedSessionDidFromSigner(
      didOrSigner,
      getCacaoResources(),
      controllerChainID,
    );
  } else {
    // NOTE: for a signer we can check and pass the controller EIP155 chainID, but we can't edit that if it's a preauthorized DID
    if (controller !== undefined && didOrSigner.parent !== controller) {
      console.error(
        `${LOG_CTX} DID and controller mismatch, is the chainID set correctly?`,
        { didParent: didOrSigner.parent, streamController: controller },
      );
      throw PublishError.wrongOwner(
        "DID and controller mismatch; is the chainID set correctly?",
        controller,
        didOrSigner.parent,
      );
    }
    did = didOrSigner;
  }

  let ids: NodeIDs;
  try {
    if (existingStreamID) {
      // We know about the stream already; let's assume we backfilled initially
      console.log(`${LOG_CTX} publishing to known stream...`, {
        streamID: existingStreamID,
      });
      ids = await updateResearchObjectC1(client, did, {
        id: existingStreamID,
        title: prepublishResult.updatedManifest.title,
        manifest: prepublishResult.updatedManifestCid,
        license: prepublishResult.updatedManifest.defaultLicense || "",
      });
      console.log(`${LOG_CTX} successfully updated research object`, ids);
    } else if (dpidHistory.length === 0) {
      console.log(`${LOG_CTX} publishing to new stream...`);
      ids = await createResearchObjectC1(client, did, {
        title: prepublishResult.updatedManifest.title || "",
        manifest: prepublishResult.updatedManifestCid,
        license: prepublishResult.updatedManifest.defaultLicense || "",
      });
      console.log(`${LOG_CTX} published to new stream`, ids);
    } else {
      console.log(`${LOG_CTX} backfilling new stream to mirror history...`, {
        dpidHistory,
      });
      const streamID = await backfillNewStreamC1(client, did, dpidHistory);
      console.log(`${LOG_CTX} backfill done, appending latest event...`);
      await sleep(1_000);
      ids = await updateResearchObjectC1(client, did, {
        id: streamID,
        title: prepublishResult.updatedManifest.title,
        manifest: prepublishResult.updatedManifestCid,
        license: prepublishResult.updatedManifest.defaultLicense || "",
      });
      console.log(`${LOG_CTX} successfully appended latest update`, ids);
    }
  } catch (e) {
    console.error(`${LOG_CTX} failed to update reseach object`, {
      existingStreamID,
      err: errWithCause(e as Error),
    });
    throw PublishError.ceramicWrite(
      "Failed to write research object",
      e as Error,
    );
  }
  return ids;
};

const codexPublishComposeDB = async (
  prepublishResult: PrepublishResponse,
  dpidHistory: IndexedNodeVersion[],
  didOrSigner: DID | Signer,
) => {
  const nodeUrl = getNodesLibInternalConfig().ceramicNodeUrl;
  console.log(LOG_CTX, `starting ComposeDB publish with node ${nodeUrl}...`);

  const ceramic = newCeramicClient(nodeUrl);
  const compose = newComposeClient({ ceramic });

  const existingStreamID = prepublishResult.ceramicStream;

  let controller: string | undefined;
  let controllerChainID: string | undefined;
  if (existingStreamID) {
    const stream = await ceramic.loadStream(existingStreamID);
    controller = stream.state.metadata.controllers[0];
    controllerChainID = controller.match(/eip155:(\d+):/)!.at(1);
  }

  if (didOrSigner instanceof Signer) {
    compose.setDID(
      // Wrangle a DID out of the signer for Ceramic auth
      await authorizedSessionDidFromSigner(
        didOrSigner,
        compose.resources,
        controllerChainID,
      ),
    );
  } else {
    // NOTE: for a signer we can check and pass the controller EIP155 chainID, but we can't edit that if it's a preauthorized DID
    if (controller !== undefined && didOrSigner.parent !== controller) {
      console.error(
        `${LOG_CTX} DID and controller mismatch, is the chainID set correctly?`,
        { didParent: didOrSigner.parent, streamController: controller },
      );
      throw PublishError.wrongOwner(
        "DID and controller mismatch; is the chainID set correctly?",
        controller,
        didOrSigner.parent,
      );
    }
    compose.setDID(didOrSigner);
  }

  let ids: NodeIDs;
  try {
    if (existingStreamID) {
      // We know about the stream already; let's assume we backfilled initially
      console.log(`${LOG_CTX} publishing to known stream...`, {
        streamID: existingStreamID,
      });
      ids = await updateResearchObject(compose, {
        id: existingStreamID,
        title: prepublishResult.updatedManifest.title,
        manifest: prepublishResult.updatedManifestCid,
      });
      console.log(`${LOG_CTX} successfully updated research object`, ids);
    } else if (dpidHistory.length === 0) {
      console.log(`${LOG_CTX} publishing to new stream...`);
      ids = await createResearchObject(compose, {
        title: prepublishResult.updatedManifest.title || "",
        manifest: prepublishResult.updatedManifestCid,
        license: prepublishResult.updatedManifest.defaultLicense || "",
      });
      console.log(`${LOG_CTX} published to new stream`, ids);
    } else {
      console.log(`${LOG_CTX} backfilling new stream to mirror history...`, {
        dpidHistory,
      });
      const streamID = await backfillNewStream(compose, dpidHistory);
      console.log(`${LOG_CTX} backfill done, appending latest event...`);
      ids = await updateResearchObject(compose, {
        id: streamID,
        title: prepublishResult.updatedManifest.title,
        manifest: prepublishResult.updatedManifestCid,
        license: prepublishResult.updatedManifest.defaultLicense || "",
      });
      console.log(`${LOG_CTX} successfully appended latest update`, ids);
    }
  } catch (e) {
    console.error(`${LOG_CTX} failed to update reseach object`, {
      existingStreamID,
      err: errWithCause(e as Error),
    });
    throw PublishError.ceramicWrite(
      "Failed to write research object",
      e as Error,
    );
  }
  return ids;
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
  versions: IndexedNodeVersion[],
): Promise<string> => {
  console.log(
    LOG_CTX,
    `starting backfill migration for versions:\n${JSON.stringify(
      versions,
      undefined,
      2,
    )}`,
  );
  const backfillSequential = async (
    prevPromise: Promise<NodeIDs>,
    nextVersion: IndexedNodeVersion,
    ix: number,
  ): Promise<NodeIDs> => {
    const { streamID, commitID } = await prevPromise;
    if (streamID) {
      console.log(
        LOG_CTX,
        `backfilled version ${ix} into ${streamID} with commit ${commitID}`,
      );
    }

    const title = "[BACKFILLED]"; // version.title is the title of the event, e.g. "Published"
    const license = "[BACKFILLED]";

    // When pulling history from new contract legacy entries, the CID
    // is cleartext. Otherwise, it needs to be decoded from hex.
    let manifest: string;
    try {
      // If this works, it was a plaintext CID
      manifest = CID.parse(nextVersion.cid).toString();
    } catch {
      // Otherwise, fall back to hex decoding old style representation
      console.log(
        `${LOG_CTX} got non-plaintext CID in next version to backfill`,
        { nextVersion },
      );
      manifest = convert0xHexToCid(nextVersion.cid);
    }

    const op =
      streamID === ""
        ? createResearchObject(compose, { title, manifest, license })
        : updateResearchObject(compose, {
            id: streamID,
            title,
            manifest,
            license,
          });
    return op;
  };

  const { streamID } = await versions.reduce(
    backfillSequential,
    Promise.resolve({ streamID: "", commitID: "" }),
  );
  return streamID;
};

const backfillNewStreamC1 = async (
  client: ReturnType<typeof newStreamClient>,
  did: DID,
  versions: IndexedNodeVersion[],
): Promise<string> => {
  console.log(
    LOG_CTX,
    `starting backfill migration for versions:\n${JSON.stringify(
      versions,
      undefined,
      2,
    )}`,
  );
  const backfillSequential = async (
    prevPromise: Promise<NodeIDs>,
    nextVersion: IndexedNodeVersion,
    ix: number,
  ): Promise<NodeIDs> => {
    const { streamID } = await prevPromise;
    await sleep(1_000);

    const title = "[BACKFILLED]"; // version.title is the title of the event, e.g. "Published"
    const license = "[BACKFILLED]";

    // When pulling history from new contract legacy entries, the CID
    // is cleartext. Otherwise, it needs to be decoded from hex.
    let manifest: string;
    try {
      // If this works, it was a plaintext CID
      manifest = CID.parse(nextVersion.cid).toString();
    } catch {
      // Otherwise, fall back to hex decoding old style representation
      console.log(
        `${LOG_CTX} got non-plaintext CID in next version to backfill`,
        { nextVersion },
      );
      manifest = convert0xHexToCid(nextVersion.cid);
    }

    const op =
      streamID === ""
        ? createResearchObjectC1(client, did, { title, manifest, license })
        : updateResearchObjectC1(client, did, {
            id: streamID,
            title,
            manifest,
            license,
          });

    let result;
    try {
      result = await op;
      console.log(LOG_CTX, `backfilled version to stream`, {
        version: ix,
        manifest,
        streamID: result.streamID,
        commitID: result.commitID,
      });
    } catch (error) {
      console.error(LOG_CTX, `failed to backfill version ${ix}:`, error);
      throw error;
    }
    return result;
  };

  const { streamID } = await versions.reduce(
    backfillSequential,
    Promise.resolve({ streamID: "", commitID: "" }),
  );
  return streamID;
};

/**
 * Get the raw stream state for a streamID.
 */
export const getStreamController = async (streamID: string) => {
  const config = getNodesLibInternalConfig();
  const useCeramicOne = config.ceramicOneRpcUrl !== undefined;
  if (useCeramicOne) {
    const client = newStreamClient({ ceramic: config.ceramicOneRpcUrl });
    const state = await client.getStreamState(streamID);
    return state.controller;
  } else {
    const ceramic = newCeramicClient(config.ceramicNodeUrl);
    const stream = await streams.loadID(
      ceramic,
      streams.StreamID.fromString(streamID),
    );
    return stream.state.metadata.controllers[0];
  }
};
