import type {
  AxiosRequestConfig,
} from "axios";
import axios from "axios";
import type {
  ResearchObjectV1,
} from "@desci-labs/desci-models";
import { ceramicPublish } from "./codex.js";

// Set these dynamically in some reasonable fashion
const NODES_API_URL = process.env.NODES_API_URL || "http://localhost:5420";

const ROUTES = {
  deleteFile: `${NODES_API_URL}/v1/data/delete`,
  createDraft: `${NODES_API_URL}/v1/nodes/createDraft`,
  /** Append uuid for node to show */
  showNode: `${NODES_API_URL}/v1/nodes/objects/`,
  prepublish: `${NODES_API_URL}/v1/nodes/prepublish`,
  publish: `${NODES_API_URL}/v1/nodes/publish`,
} as const;
type Route = typeof ROUTES[keyof typeof ROUTES];

export type CreateDraftParams = {
  title: string,
  // Should be able to skip these
  // links?: {
  //   pdf?: string[],
  //   metadata?: string[],
  // },
  // TODO get license types
  defaultLicense: string,
  researchFields: string[],
};

export type CreateDraftResponse = {
  ok: boolean,
  hash: string,
  uri: string,
  node: any, // Prisma Node
  version: any, // Prisma NodeVersion
  documentId: string,
}

export const createDraftNode = async (
  params: CreateDraftParams,
  authToken: string,
) => {
  const payload = {
    ...params,
    links: {},
  };
  const { status, statusText, data } = await axios.post<CreateDraftResponse>(
    ROUTES.createDraft, payload, authConfig(authToken)
  );

  if (status !== 200) {
    throwWithReason(ROUTES.createDraft, status, statusText);
  };

  return data;
};

export const showNode = async (
  uuid: string,
  authToken: string,
) => {
  const { status, statusText, data } = await axios.get(
    ROUTES.showNode + uuid,
    authConfig(authToken),
  );

  if (status !== 200) {
    throwWithReason(ROUTES.showNode, status, statusText + ` (uuid: ${uuid})`);
  };

  return data;
};

type PublishParams = {
  uuid: string,
  cid: string,
  manifest: ResearchObjectV1,
  transactionId?: string,
  nodeVersionId?: string,
  ceramicStream?: string,
};

type NodeVersion = {
    id: number;
    manifestUrl: string;
    cid: string;
    transactionId: string | null;
    nodeId: number | null;
};

export type PrepublishResponse = {
    ok: boolean;
    updatedManifestCid: string;
    updatedManifest: ResearchObjectV1;
    version?: NodeVersion;
    ceramicStream?: string;
};

export const publishDraftNode = async (
  uuid: string,
  authToken: string,
) => {
  // Compute the draft drive DAG, and update the data bucket CID
  const { status: preStatus, statusText: preStatusText, data: preData } = await axios.post<PrepublishResponse>(
    ROUTES.prepublish,
    {
      uuid,
    },
    authConfig(authToken),
  );

  if (preStatus !== 200) {
    throwWithReason(ROUTES.publish, preStatus, preStatusText);
  };

  const { updatedManifestCid, updatedManifest, ceramicStream } = preData;

  const streamID = await ceramicPublish(
    preData,
    {
      existingStream: ceramicStream,
      // TODO do we want to query for on-chain history? :/
      // Otherwise, we can just init as stream if unknown (no backfilled history)
      versions: []
    },
    process.env.SEED!
  );

  const pubParams: PublishParams = {
    uuid,
    cid: updatedManifestCid,
    manifest: updatedManifest,
    ceramicStream: streamID,
  };

  const { status, statusText, data } = await axios.post<{ok: boolean}>(
    ROUTES.publish,
    pubParams,
    authConfig(authToken),
  );

  if (status !== 200) {
    throwWithReason(ROUTES.publish, status, statusText);
  };
  return { ...data, streamID };
};

export type DeleteFileParams = {
  nodeUuid: string,
  filePath: string,
};

export type UpdateDeleteFileResponse = {
  manifest: ResearchObjectV1;
  manifestCid: string;
};

export const deleteFile = async (
  params: DeleteFileParams,
  authToken: string
) => {
  const { status, statusText, data } = await axios.post<UpdateDeleteFileResponse>(
    ROUTES.deleteFile, params, authConfig(authToken)
  );

  if (status !== 200) {
    throwWithReason(ROUTES.deleteFile, status, statusText);
  };

  return data;
};

const throwWithReason = (
  route: Route,
  status: number,
  reason: string
) => {
  throw new Error(`Request to ${route} failed (${status}): ${reason}`)
};

const authConfig = (token: string): AxiosRequestConfig => ({
  headers: {
    "authorization": `Bearer ${token}`
  }
});
