import axios from "axios";
import type {
  DriveObject,
  ResearchObjectV1,
} from "@desci-labs/desci-models";
import { codexPublish } from "./codex.js";
import FormData from "form-data";
import { createReadStream } from "fs";
import { basename } from "path";
import type { NodeIDs } from "@desci-labs/desci-codex-lib/dist/src/types.js";
import { publish } from "./publish.js";
import { PublishError } from "./errors.js";

// Set these dynamically in some reasonable fashion
const NODES_API_URL = process.env.NODES_API_URL || "http://localhost:5420";

const ROUTES = {
  deleteFile: `${NODES_API_URL}/v1/data/delete`,
  updateData: `${NODES_API_URL}/v1/data/update`,
  /** Append /uuid/manifestCid for tree to fetch */
  retrieveTree: `${NODES_API_URL}/v1/data/retrieveTree`,
  moveData: `${NODES_API_URL}/v1/data/move`,
  createDraft: `${NODES_API_URL}/v1/nodes/createDraft`,
  /** Append /uuid with node to delete */
  deleteDraft: `${NODES_API_URL}/v1/nodes`,
  /** Append /uuid for node to show */
  showNode: `${NODES_API_URL}/v1/nodes/objects`,
  prepublish: `${NODES_API_URL}/v1/nodes/prepublish`,
  publish: `${NODES_API_URL}/v1/nodes/publish`,
  /** Append /uuid for node to fetch publish history for */
  dpidHistory: `${NODES_API_URL}/v1/pub/versions`,
} as const;
type Route = typeof ROUTES[keyof typeof ROUTES];

export type CreateDraftParams = {
  title: string,
  // Some desci-server code expects arrays to exist
  links: {
    pdf: string[],
    metadata: string[],
  },
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
  params: Omit<CreateDraftParams, "links">,
  authToken: string,
): Promise<CreateDraftResponse> => {
  const payload: CreateDraftParams = {
    ...params,
    links: {
      pdf: [],
      metadata: [],
    },
  };
  const { status, statusText, data } = await axios.post<CreateDraftResponse>(
    ROUTES.createDraft, payload, { headers: getHeaders(authToken) }
  );

  if (status !== 200) {
    throwWithReason(ROUTES.createDraft, status, statusText);
  };

  return data;
};

export const deleteDraftNode = async (
  uuid: string,
  authToken: string,
): Promise<void> => {
  const { status, statusText } = await axios.delete(
    ROUTES.deleteDraft + `/${uuid}`,
    { headers: getHeaders(authToken) }
  );

  if (status !== 200) {
    throwWithReason(ROUTES.deleteDraft, status, statusText);
  };
};

export type NodeResponse = {
  id: number,
  createdAt: string,
  updatedAt: string,
  title: string,
  cid: string,
  state: string,
  isFeatured: boolean,
  manifestUrl: string,
  /** Stringified JSON manifest */
  restBody: string,
  replicationFactor: number,
  ownerId: number,
  uuid: string,
  deletedAt?: string,
  isDeleted: boolean,
  manifestDocumentId: string,
  ceramicStream?: string,
};

export const getDraftNode = async (
  uuid: string,
  authToken: string,
): Promise<NodeResponse> => {
  const { status, statusText, data } = await axios.get<NodeResponse>(
    ROUTES.showNode + `/${uuid}`,
    { headers: getHeaders(authToken), }
  );

  if (status !== 200) {
    throwWithReason(ROUTES.showNode, status, statusText + ` (uuid: ${uuid})`);
  };

  return data;
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

/**
 * Computes the draft drive DAG, and updates the data bucket CID
 * with the new root. Note this does not actually publish the draft,
 * just tells the backend to prepare for it.
 * 
 * @param uuid - UUID of the node to prepublish.
 * @param authToken - Your API key.
*/
export const prePublishDraftNode = async (
  uuid: string,
  authToken: string,
): Promise<PrepublishResponse> => {
  // Compute the draft drive DAG, and update the data bucket CID
  const { status, statusText, data } = await axios.post<PrepublishResponse>(
    ROUTES.prepublish,
    { uuid },
    { headers: getHeaders(authToken), }
  );

  if (status !== 200) {
    throwWithReason(ROUTES.publish, status, statusText);
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

export type PublishResponse = {
  ok: boolean,
  updatedManifestCid: string,
  ceramicIDs?: NodeIDs,
};

export const publishDraftNode = async (
  uuid: string,
  authToken: string,
  pkey: string,
): Promise<PublishResponse> => {
  const publishResult = await publish(uuid, authToken, pkey);

  const pubParams: PublishParams = {
    uuid,
    cid: publishResult.cid,
    manifest: publishResult.manifest,
    transactionId: publishResult.transactionId,
    ceramicStream: publishResult.ceramicIDs?.streamID,
  };

  const { status, statusText, data } = await axios.post<{ok: boolean}>(
    ROUTES.publish,
    pubParams,
    { headers: getHeaders(authToken), }
  );

  if (status !== 200) {
    console.log(`Publish flow has been successful, but backend update failed for uuid ${uuid}.`);
    throwWithReason(ROUTES.publish, status, statusText);
  };

  return { 
    ...data,
    ceramicIDs: publishResult.ceramicIDs,
    updatedManifestCid: publishResult.cid
  };
};

export type DeleteFileParams = {
  uuid: string,
  path: string,
};

export type DeleteFileResponse = {
  manifest: ResearchObjectV1;
  manifestCid: string;
};

export const deleteFile = async (
  params: DeleteFileParams,
  authToken: string
) => {
  const { status, statusText, data } = await axios.post<DeleteFileResponse>(
    ROUTES.deleteFile, params, { headers: getHeaders(authToken) }
  );

  if (status !== 200) {
    throwWithReason(ROUTES.deleteFile, status, statusText);
  };

  return data;
};

export type MoveDataParams = {
  uuid: string,
  /** Prefix path with `/root` to indicate the absolute path */
  oldPath: string,
  /** Prefix path with `/root` to indicate the absolute path */
  newPath: string,
};

export type MoveDataResponse = {
  manifest: ResearchObjectV1,
  manifestCid: string,
};

export const moveData = async (
  params: MoveDataParams,
  authToken: string,
) => {
  const { status, statusText, data } = await axios.post<MoveDataResponse>(
    ROUTES.moveData, params, { headers: getHeaders(authToken) }
  );

  if (status !== 200) {
    throwWithReason(ROUTES.moveData, status, statusText);
  };

  return data;
};

export type RetrieveResponse = {
  status?: number;
  tree: DriveObject[];
  date: string;
};

export const retrieveDraftFileTree = async (
  uuid: string,
  manifestCid: string,
  authToken: string,
) => {
  const { status, statusText, data } = await axios.get<RetrieveResponse>(
    ROUTES.retrieveTree + `/${uuid}/${manifestCid}`, { headers: getHeaders(authToken) }
  );

  if (status !== 200) {
    throwWithReason(ROUTES.retrieveTree, status, statusText);
  };

  return data;
};

export type CreateFolderParams = {
  uuid: string,
  locationPath: string,
  folderName: string,
};

export type CreateFolderResponse = {
  manifest: ResearchObjectV1,
  manifestCid: string,
  tree: DriveObject[],
  date: string,
};

export const createNewFolder = async (
  params: CreateFolderParams,
  authToken: string,
) => {
  const { uuid, folderName, locationPath } = params;
  const form = new FormData();
  form.append("uuid", uuid);
  form.append("newFolderName", folderName);
  form.append("contextPath", locationPath);
  const { status, statusText, data } = await axios.post<CreateFolderResponse>(
    ROUTES.updateData, form, { headers: getHeaders(authToken, true)}
  );

  if (status !== 200) {
    throwWithReason(ROUTES.updateData, status, statusText);
  };
  
  return data;
};

export type UploadParams = {
  uuid: string,
  /** Prefix path with `root/` to indicate absolute path */
  targetPath: string,
  filePaths: string[],
};

export type UploadFilesResponse = {
  manifest: ResearchObjectV1,
  manifestCid: string,
  tree: DriveObject[],
  date: string,
};

export const uploadFiles = async (
  params: UploadParams,
  authToken: string,
): Promise<UploadFilesResponse> => {
  const { uuid, targetPath, filePaths } = params;
  const form = new FormData();
  form.append("uuid", uuid);
  form.append("contextPath", targetPath);

  filePaths.forEach(f => {
    const stream = createReadStream(f);
    form.append("files", stream, basename(f));
  });

  const { status, statusText, data } = await axios.post<UploadFilesResponse>(
    ROUTES.updateData, form, { headers: getHeaders(authToken, true)}
  );

  if (status !== 200) {
    throwWithReason(ROUTES.updateData, status, statusText);
  };

  return data;
};

/** Historical log entry for a dPID */
export type IndexedNodeVersion = {
  /** Manifest CID in EVM format */
  cid: string;
  /** Transaction ID of the update event */
  id: string;
  /** Epoch timestamp of the update*/
  time: string;
};

/** Represents the state and publication history of a dPID */
export type IndexedNode = {
  /** Node UUID in hex */
  id: string;
  /** Node UUID in decimal */
  id10: string;
  /** Account who owns the node */
  owner: string;
  /** The most recent manifest CID */
  recentCid: string;
  /** Publication history of the node */
  versions: IndexedNodeVersion[];
};

export const getDpidHistory = async (
  uuid: string,
): Promise<IndexedNodeVersion[]> => {
  const { status, statusText, data } = await axios.get<IndexedNode>(
    ROUTES.dpidHistory + `/${uuid}`
  );

  if (status !== 200) {
    throwWithReason(ROUTES.dpidHistory, status, statusText);
  };

  return data.versions;
};

const throwWithReason = (
  route: Route,
  status: number,
  reason: string
) => {
  throw new Error(`Request to ${route} failed (${status}): ${reason}`)
};

const getHeaders = (token: string, formData: boolean = false) => {
  const headers = {
    "authorization": `Bearer ${token}`,
    ...(formData ? { "content-type": "multipart/form-data" } : {})
  };
  return headers;
};
