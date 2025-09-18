/**
 * History-related functions that depend on FlightSQL queries
 * These are only available in Node.js environments
 */
import { getCodexHistory } from "./flight-sql.js";
import { convertUUIDToDecimal } from "../shared/util/converting.js";
import { getDraftNode, type IndexedNode } from "../shared/api.js";

/**
 * Get the codex publish history for a given node.
 * Note: calling this right after publish may fail
 * since the publish operation may not have finished.
 */
export const getPublishHistory = async (uuid: string): Promise<IndexedNode> => {
  const { ceramicStream } = await getDraftNode(uuid);
  if (!ceramicStream) {
    throw new Error(`No known stream for node ${uuid}`);
  }

  const resolved = await getCodexHistory(ceramicStream);
  const versions = resolved.versions.map((e) => ({
    cid: e.manifest,
    time: e.time?.toString() || "", // May happen if commit is not anchored
  }));

  const indexedNode: IndexedNode = {
    id: uuid,
    id10: convertUUIDToDecimal(uuid),
    owner: resolved.owner,
    recentCid: resolved.manifest,
    versions,
  };

  return indexedNode;
};
