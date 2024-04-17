import { type NodeIDs } from "@desci-labs/desci-codex-lib";
import { getDpidHistory } from "./api.js";
import { dpidPublish, hasDpid } from "./chain.js";
import { codexPublish } from "./codex.js";
import { Signer } from "ethers";
import { type DID } from "dids";

/**
 * The complete publish flow, including both the dPID registry and Codex.
 * 
 * @param uuid - Node to publish
 * @param signer - Used to sign TXs for chain, and a SIWE CACAO for ceramic if did argument is not present
 * @param did - An authenticated DID from a DIDSession, better UX as it has a signing capability already
 *
 * @throws (@link WrongOwnerError) if signer address isn't token owner
 * @throws (@link DpidPublishError) if dPID couldnt be registered or updated
*/
export const publish = async (
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
