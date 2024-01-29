import type { AxiosRequestConfig } from 'axios';
import axios from 'axios';
import type { DriveObject, ResearchObjectV1 } from '@desci-labs/desci-models';
import { ceramicPublish } from './codex.js';
import FormData from 'form-data';
import { lookup } from 'mime-types';
import { readFileSync } from 'fs';
import { basename } from 'path';
import { Blob } from 'node:buffer';

// Set these dynamically in some reasonable fashion
const NODES_API_URL = process.env.NODES_API_URL || 'http://localhost:5420';

const ROUTES = {
  deleteFile: `${NODES_API_URL}/v1/data/delete`,
  updateData: `${NODES_API_URL}/v1/data/update`,
  /** Append /uuid/manifestCid for tree to fetch */
  retrieveTree: `${NODES_API_URL}/v1/data/retrieveTree`,
  moveData: `${NODES_API_URL}/v1/data/move`,
  createDraft: `${NODES_API_URL}/v1/nodes/createDraft`,
  /** Append /uuid for node to show */
  showNode: `${NODES_API_URL}/v1/nodes/objects`,
  prepublish: `${NODES_API_URL}/v1/nodes/prepublish`,
  publish: `${NODES_API_URL}/v1/nodes/publish`,
} as const;
type Route = (typeof ROUTES)[keyof typeof ROUTES];

export type CreateDraftParams = {
  title: string;
  // Some desci-server code expects arrays to exist
  links: {
    pdf: string[];
    metadata: string[];
  };
  // TODO get license types
  defaultLicense: string;
  researchFields: string[];
};

export type CreateDraftResponse = {
  ok: boolean;
  hash: string;
  uri: string;
  node: any; // Prisma Node
  version: any; // Prisma NodeVersion
  documentId: string;
};

export const createDraftNode = async (params: Omit<CreateDraftParams, 'links'>, authToken: string) => {
  const payload: CreateDraftParams = {
    ...params,
    links: {
      pdf: [],
      metadata: [],
    },
  };
  const { status, statusText, data } = await axios.post<CreateDraftResponse>(
    ROUTES.createDraft,
    payload,
    authConfig(authToken),
  );

  if (status !== 200) {
    throwWithReason(ROUTES.createDraft, status, statusText);
  }

  return data;
};

export const getDraftNode = async (uuid: string, authToken: string) => {
  const { status, statusText, data } = await axios.get(ROUTES.showNode + `/${uuid}`, authConfig(authToken));

  if (status !== 200) {
    throwWithReason(ROUTES.showNode, status, statusText + ` (uuid: ${uuid})`);
  }

  return data;
};

type PublishParams = {
  uuid: string;
  cid: string;
  manifest: ResearchObjectV1;
  transactionId?: string;
  nodeVersionId?: string;
  ceramicStream?: string;
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

export const publishDraftNode = async (uuid: string, authToken: string) => {
  // Compute the draft drive DAG, and update the data bucket CID
  const {
    status: preStatus,
    statusText: preStatusText,
    data: preData,
  } = await axios.post<PrepublishResponse>(
    ROUTES.prepublish,
    {
      uuid,
    },
    authConfig(authToken),
  );

  if (preStatus !== 200) {
    throwWithReason(ROUTES.publish, preStatus, preStatusText);
  }

  const { updatedManifestCid, updatedManifest, ceramicStream } = preData;

  const ceramicIDs = await ceramicPublish(
    preData,
    {
      existingStream: ceramicStream,
      // TODO do we want to query for on-chain history? :/
      // Otherwise, we can just init as stream if unknown (no backfilled history)
      versions: [],
    },
    process.env.SEED!,
  );

  const pubParams: PublishParams = {
    uuid,
    cid: updatedManifestCid,
    manifest: updatedManifest,
    ceramicStream: ceramicIDs.streamID,
  };

  const { status, statusText, data } = await axios.post<{ ok: boolean }>(
    ROUTES.publish,
    pubParams,
    authConfig(authToken),
  );

  if (status !== 200) {
    throwWithReason(ROUTES.publish, status, statusText);
  }
  return { ...data, ceramicIDs };
};

export type DeleteFileParams = {
  nodeUuid: string;
  filePath: string;
};

export type DeleteFileResponse = {
  manifest: ResearchObjectV1;
  manifestCid: string;
};

export const deleteFile = async (params: DeleteFileParams, authToken: string) => {
  const { status, statusText, data } = await axios.post<DeleteFileResponse>(
    ROUTES.deleteFile,
    params,
    authConfig(authToken),
  );

  if (status !== 200) {
    throwWithReason(ROUTES.deleteFile, status, statusText);
  }

  return data;
};

export type MoveDataParams = {
  uuid: string;
  /** Prefix path with `/root` to indicate the absolute path */
  oldPath: string;
  /** Prefix path with `/root` to indicate the absolute path */
  newPath: string;
};

export type MoveDataResult = {
  manifest: ResearchObjectV1;
  manifestCid: string;
};

export const moveData = async (params: MoveDataParams, authToken: string) => {
  const { status, statusText, data } = await axios.post<MoveDataResult>(ROUTES.moveData, params, authConfig(authToken));

  if (status !== 200) {
    throwWithReason(ROUTES.moveData, status, statusText);
  }

  return data;
};

export type RetrieveResponse = {
  status?: number;
  tree: DriveObject[];
  date: string;
};

export const retrieveDraftFileTree = async (uuid: string, manifestCid: string, authToken: string) => {
  const { status, statusText, data } = await axios.get<RetrieveResponse>(
    ROUTES.retrieveTree + `/${uuid}/${manifestCid}`,
    authConfig(authToken),
  );

  if (status !== 200) {
    throwWithReason(ROUTES.retrieveTree, status, statusText);
  }

  return data;
};

export const createNewFolder = async (uuid: string, locationPath: string, folderName: string, authToken: string) => {
  const form = new FormData();
  form.append('uuid', uuid);
  form.append('newFolderName', folderName);
  form.append('contextPath', locationPath);
  const config = {
    headers: {
      ...authConfig(authToken).headers,
      'content-type': 'multipart/form-data',
    },
  };
  const { status, statusText, data } = await axios.post(ROUTES.updateData, form, config);

  if (status !== 200) {
    throwWithReason(ROUTES.updateData, status, statusText);
  }

  return data;
};

export type UploadParams = {
  uuid: string;
  manifest: ResearchObjectV1;
  targetPath: string;
  filePaths: string[];
};

export const uploadFiles = async (params: UploadParams, authToken: string) => {
  const { uuid, manifest, targetPath, filePaths } = params;
  const form = new FormData();
  form.append('uuid', uuid);
  form.append('manifest', JSON.stringify(manifest));
  form.append('contextPath', targetPath);

  filePaths.forEach((f) => {
    // TODO less stupid, dr. memory assault
    const blob = new Blob([readFileSync(f)], { type: lookup(f) as string });
    const filename = basename(f);
    form.append('files', JSON.stringify(blob.arrayBuffer()), filename);
  });

  const config = {
    headers: {
      ...authConfig(authToken).headers,
      'content-type': 'multipart/form-data',
    },
  };
  const { status, statusText, data } = await axios.post(ROUTES.updateData, form, config);

  if (status !== 200) {
    throwWithReason(ROUTES.updateData, status, statusText);
  }

  return data;
};

const throwWithReason = (route: Route, status: number, reason: string) => {
  throw new Error(`Request to ${route} failed (${status}): ${reason}`);
};

const authConfig = (token: string): AxiosRequestConfig => ({
  headers: {
    'api-key': token,
  },
});
