import { type NodeIDs } from "@desci-labs/desci-codex-lib/dist/src/index.js";
import { getDpidHistory } from "./api.js";
import { dpidPublish, hasDpid, type DpidPublishResult } from "./chain.js";
import { codexPublish } from "./codex.js";
import { PublishError } from "./errors.js";

/**
 * The complete publish flow, including both the dPID registry and Codex.
*/
export const publish = async (
  uuid: string,
) => {
  let chainPubResponse: DpidPublishResult;
  let preexistingDpid: boolean;
  try {
    preexistingDpid = await hasDpid(uuid);
    chainPubResponse = await dpidPublish(uuid, preexistingDpid);
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
      cause: err,
    });
  };

  let ceramicIDs: NodeIDs | undefined;
  try {
    // If the dPID is new, skip checking for history to potentially backfill
    const publishHistory = preexistingDpid
      ? await getDpidHistory(uuid)
      : [];
    ceramicIDs = await codexPublish(chainPubResponse.prepubResult, publishHistory);
  } catch (e) {
    const err = e as Error;
    console.log("Codex publish failed:", err);
    console.log(`Publish flow will continue with uuid ${uuid} as dPID registry already has been updated.`);
  };

  return {
    manifest: chainPubResponse.prepubResult.updatedManifest,
    cid: chainPubResponse.prepubResult.updatedManifestCid,
    ceramicIDs: ceramicIDs,
    transactionId: chainPubResponse.reciept.transactionHash,
  };
};
