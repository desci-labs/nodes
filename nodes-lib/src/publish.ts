import { type NodeIDs } from "@desci-labs/desci-codex-lib";
import { getDpidHistory } from "./api.js";
import { dpidPublish, hasDpid } from "./chain.js";
import { codexPublish } from "./codex.js";
import { Signer } from "ethers";

/**
 * The complete publish flow, including both the dPID registry and Codex.
 *
 * @throws (@link WrongOwnerError) if signer address isn't token owner
 * @throws (@link DpidPublishError) if dPID couldnt be registered or updated
*/
export const publish = async (
  uuid: string,
  provider: Signer,
  skipCodex: boolean = false,
) => {
  const preexistingDpid = await hasDpid(uuid, provider);

  // Throws on ownership check or dpid publish/update failure
  const chainPubResponse = await dpidPublish(uuid, preexistingDpid, provider);
  const dpidResult = {
    manifest: chainPubResponse.prepubResult.updatedManifest,
    cid: chainPubResponse.prepubResult.updatedManifestCid,
    transactionId: chainPubResponse.reciept.transactionHash,
    ceramicIDs: undefined,
  };

  if (skipCodex) {
    return dpidResult;
  };

  let ceramicIDs: NodeIDs | undefined;
  try {
    // If the dPID is new, skip checking for history to potentially backfill
    const publishHistory = preexistingDpid
      ? (await getDpidHistory(uuid)).versions
      : [];
    ceramicIDs = await codexPublish(chainPubResponse.prepubResult, publishHistory, provider);
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
