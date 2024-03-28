import {
  createResearchObject,
  newComposeClient,
  updateResearchObject,
  type ComposeClient,
  type NodeIDs,
  queryResearchObject,
  resolveHistory,
  newCeramicClient,
} from "@desci-labs/desci-codex-lib";
import type { IndexedNodeVersion, PrepublishResponse } from "./api.js";
import { convert0xHexToCid } from "./util/converting.js";
import { getConfig } from "./config/index.js";
import { Signer, providers } from "ethers";
import { EthereumWebAuth, getAccountId } from "@didtools/pkh-ethereum";
import { DIDSession } from "did-session";

const LOG_CTX = "[nodes-lib::codex]";
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
  provider: providers.Web3Provider,
): Promise<NodeIDs> => {
  const nodeUrl = getConfig().ceramicNodeUrl;
  console.log(LOG_CTX, `starting publish with node ${nodeUrl}...`);
  const ceramic = newCeramicClient(nodeUrl);
  const compose = newComposeClient({ ceramic });

  // Wrangle a DID out of the signer for Ceramic auth
  const did = await sessionFromProvider(provider, compose.resources);
  compose.setDID(did);

  // If we know about a stream already, let's assume we backfilled it initially
  if (prepublishResult.ceramicStream) {
    console.log(LOG_CTX, `publishing to known stream ${prepublishResult.ceramicStream}...`);
    const ro = await updateResearchObject(compose, {
      id: prepublishResult.ceramicStream,
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

    console.log(LOG_CTX, "backfill done, recursing to append latest event...");
    return await codexPublish(
      { ...prepublishResult, ceramicStream: streamID },
      dpidHistory,
      provider,
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
    const manifest = convert0xHexToCid(nextVersion.cid);
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

export const getPublishedFromCodex = async (
  id: string
) => {
  const ceramic = newCeramicClient(getConfig().ceramicNodeUrl);

  const compose = newComposeClient({ ceramic });
  return await queryResearchObject(compose, id);
};

export const getCodexHistory = async (
  streamID: string
) => {
  const ceramic = newCeramicClient(getConfig().ceramicNodeUrl);
  return await resolveHistory(ceramic, streamID);
};

const sessionFromProvider = async (
  provider: providers.Web3Provider,
  resources: string[],
) => {
  const externalProvider = provider.provider;
  const accountId = await getAccountId(externalProvider, await provider.getSigner().getAddress());
  const authMethod = await EthereumWebAuth.getAuthMethod(externalProvider, accountId)
  const session = await DIDSession.authorize(authMethod, { resources });
  return session.did;
};
