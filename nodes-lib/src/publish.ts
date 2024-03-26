import { type NodeIDs } from "@desci-labs/desci-codex-lib";
import { getDpidHistory } from "./api.js";
import { dpidPublish, hasDpid, type DpidPublishResult } from "./chain.js";
import { codexPublish } from "./codex.js";
import { PublishError } from "./errors.js";
import { Signer, providers } from "ethers";

/**
 * The complete publish flow, including both the dPID registry and Codex.
*/
export const publish = async (
  uuid: string,
  signer: Signer | providers.JsonRpcSigner,
  skipCodex: boolean = false,
) => {
  let chainPubResponse: DpidPublishResult;
  let preexistingDpid: boolean;
  try {
    preexistingDpid = await hasDpid(uuid, signer);
    chainPubResponse = await dpidPublish(uuid, preexistingDpid, signer);
  } catch (e) {
    /**
     * dPID registry operations failed. Since we can't know if the prepublish
     * results will be the same next time around, skip doing ceramic publish
     * to avoid historical drift.
     */
    const err = e as Error;
    throw new PublishError({
      name: "DPID_PUBLISH_ERROR",
      message: "dPID registration failed",
      cause: JSON.stringify(err, undefined, 2),
    });
  };

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
    ceramicIDs = await codexPublish(chainPubResponse.prepubResult, publishHistory, signer);
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
