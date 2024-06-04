import { type NodeIDs } from "@desci-labs/desci-codex-lib";
import { IndexedNodeVersion, getDpidHistory, getDraftNode, prePublishDraftNode } from "./api.js";
import { dpidPublish, hasDpid, lookupLegacyDpid } from "./chain.js";
import { codexPublish } from "./codex.js";
import { Signer } from "ethers";
import { type DID } from "dids";
import { bnToString } from "./util/converting.js";

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
  const dpid = node.manifestData.dpid?.id;

  // We know about a dPID, but not about a stream => should backfill history
  const hasHistory = 
    (dpid !== undefined) && (prepubResult.ceramicStream === undefined);

  let history: IndexedNodeVersion[] = [];
  if (hasHistory) {
    const legacyEntry = await lookupLegacyDpid(parseInt(dpid));
    // Wrangle BigNumber timestamp to string epoch
    history = legacyEntry.versions.map(
      ({ cid, time }) => ({ cid, time: bnToString(time) })
    );
  };

  // Performs backfill migration if there is no stream on record, otherwise
  // we can send the empty history array and avoid the history query
  const ceramicIDs = await codexPublish(prepubResult, history, didOrSigner);

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
