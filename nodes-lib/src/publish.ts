import { type NodeIDs } from "@desci-labs/desci-codex-lib";
import { 
  IndexedNodeVersion,
  getDpidHistory,
  getDraftNode,
  getLegacyHistory,
  prePublishDraftNode,
} from "./api.js";
import {
  dpidPublish,
  hasDpid,
} from "./chain.js";
import { codexPublish } from "./codex.js";
import { Signer } from "ethers";
import { type DID } from "dids";
import { NoSuchEntryError } from "./errors.js";

/**
 * Publish node to Codex, potentially migrating history from dPID token.
 * Does *not* automatically register a dPID in the alias registry.
 */
export const publish = async (
  uuid: string,
  didOrSigner: DID | Signer,
) => {
  const node = await getDraftNode(uuid);
  const prepubResult = await prePublishDraftNode(uuid);
  const manifestDpid = node.manifestData.dpid?.id;

  const hasDpidInManifest = manifestDpid !== undefined;
  const hasStreamOnRecord = prepubResult.ceramicStream !== null;
  const shouldDoMigration = hasDpidInManifest && !hasStreamOnRecord;

  let legacyHistory: IndexedNodeVersion[] = [];
  if (shouldDoMigration) {
    legacyHistory = await findLegacyHistory(uuid, parseInt(manifestDpid));
  };

  // Performs backfill migration if there is no stream on record, otherwise
  // we can send the empty history array and avoid the history query
  const ceramicIDs = await codexPublish(
    prepubResult,
    legacyHistory,
    didOrSigner
  );

  return {
    cid: prepubResult.updatedManifestCid,
    manifest: prepubResult.updatedManifest,
    ceramicIDs,
  };
};

/**
 * The complete publish flow, including both the dPID registry and Codex.
 * 
 * @param uuid - Node to publish
 * @param signer - Used to sign TXs for chain, and a SIWE CACAO for ceramic if did argument is not present
 * @param did - An authenticated DID from a DIDSession, better UX as it has a signing capability already
 *
 * @throws (@link WrongOwnerError) if signer address isn't token owner
 * @throws (@link DpidPublishError) if dPID couldnt be registered or updated
 * @deprecated
*/
export const legacyPublish = async (
  uuid: string,
  signer: Signer,
  did?: DID,
) => {
  const preexistingDpid = await hasDpid(uuid, signer);

  // Throws on ownership check or dpid publish/update failure
  const chainPubResponse = await dpidPublish(uuid, preexistingDpid, signer);
  const dpidResult = {
    manifest: chainPubResponse.prepubResult.updatedManifest,
    cid: chainPubResponse.prepubResult.updatedManifestCid,
    transactionId: chainPubResponse.reciept.transactionHash,
    ceramicIDs: undefined,
  };

  let ceramicIDs: NodeIDs | undefined;
  try {
    // If the dPID is new, skip checking for history to potentially backfill
    const publishHistory = preexistingDpid
      ? (await getDpidHistory(uuid)).versions
      : [];
    ceramicIDs = await codexPublish(chainPubResponse.prepubResult, publishHistory, did ?? signer);
  } catch (e) {
    const err = e as Error;
    console.log("Codex publish failed:", err);
    console.log(`Publish flow will continue with uuid ${uuid} as dPID registry already has been updated.`);
  };

  return {
    ...dpidResult,
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
): Promise<IndexedNodeVersion[]> => {
  try {
    return await getLegacyHistory(dpid);
  } catch (e) {
    if (!(e instanceof NoSuchEntryError)) {
      throw e;
    };
  };

  return (await getDpidHistory(uuid)).versions;
};
