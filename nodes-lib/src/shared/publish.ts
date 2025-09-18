import {
  IndexedNodeVersion,
  getDraftNode,
  getLegacyHistory,
  prePublishDraftNode,
} from "./api.js";
import { codexPublish } from "./codex.js";
import { Signer } from "ethers";
import { DID } from "dids";
import { PublishError } from "./errors.js";
import { fullDidToLcAddress } from "./util/converting.js";

/**
 * Publish node to Codex, potentially migrating history from dPID token.
 * Does *not* automatically register a dPID in the alias registry.
 */
export const publish = async (uuid: string, didOrSigner: DID | Signer) => {
  const node = await getDraftNode(uuid);
  const prepubResult = await prePublishDraftNode(uuid);
  const manifestDpid = node.manifestData.dpid?.id;

  const hasDpidInManifest = manifestDpid !== undefined;
  const hasStreamOnRecord = prepubResult.ceramicStream !== null;
  const shouldDoMigration = hasDpidInManifest && !hasStreamOnRecord;

  let legacyHistory: IndexedNodeVersion[] = [];
  let legacyOwner: string;
  if (shouldDoMigration) {
    const legacyLookup = await findLegacyHistory(uuid, parseInt(manifestDpid));
    legacyOwner = legacyLookup.owner.toLowerCase();
    legacyHistory = legacyLookup.versions;
    const signingAddress =
      didOrSigner instanceof DID
        ? fullDidToLcAddress(didOrSigner.parent)
        : (await didOrSigner.getAddress()).toLowerCase();

    if (legacyOwner !== signingAddress) {
      throw PublishError.wrongOwner(
        "Refusing to migrate history; signing addresses differ",
        legacyOwner,
        signingAddress || "undefined",
      );
    }
  }

  // Performs backfill migration if there is no stream on record, otherwise
  // we can send the empty history array and avoid the history query
  const ceramicIDs = await codexPublish(
    prepubResult,
    legacyHistory,
    didOrSigner,
  );

  return {
    cid: prepubResult.updatedManifestCid,
    manifest: prepubResult.updatedManifest,
    ceramicIDs,
  };
};

/**
 * Looks for legacy history for a dPID, starting with the new contract's
 * legacy mapping, falling back to querying the nodes backend for subgraph
 * indexed updates.
 *
 * For public environments, the former should always be enough, but it
 * doesn't work for testing migration etc because that logic relies on
 * looking up things only published in the legacy registry.
 *
 * This fallback logic can be cleaned up when the old contracts are paused,
 * since the data migration to the alias registry can be made final.
 */
const findLegacyHistory = async (
  uuid: string,
  dpid: number,
): Promise<{ owner: string; versions: IndexedNodeVersion[] }> => {
  try {
    return await getLegacyHistory(dpid);
  } catch (e) {
    if (e instanceof PublishError && e.details.type === "NO_SUCH_ENTRY") {
      console.log("findLegacyHistory: No match in contract legacy history", {
        dpid,
      });
    }
    throw e;
  }
};
