import axios, {
  AxiosError,
  type AxiosResponse
} from "axios";
import {
  ResearchObjectComponentType,
  type CodeComponent,
  type DataComponent,
  type DriveObject,
  type ExternalLinkComponent,
  type PdfComponent,
  type ResearchObjectV1,
  ResearchObjectComponentDocumentSubtype,
  ResearchObjectComponentLinkSubtype,
  ResearchObjectComponentCodeSubtype,
  type ManifestActions,
  type ResearchObjectV1Component,
  type License,
  type ResearchObjectV1Author,
  type ResearchField,
  type ResearchObjectComponentSubtypes,
} from "@desci-labs/desci-models";
import FormData from "form-data";
import { createReadStream } from "fs";
import type { NodeIDs } from "@desci-labs/desci-codex-lib/dist/src/types.js";
import { publish } from "./publish.js";
import type { ResearchObjectDocument } from "./automerge.js";
import { randomUUID } from "crypto";
import { NODES_API_URL, NODES_API_KEY } from "./config.js";

const ROUTES = {
  deleteData: `${NODES_API_URL}/v1/data/delete`,
  updateData: `${NODES_API_URL}/v1/data/update`,
  updateExternalCid: `${NODES_API_URL}/v1/data/updateExternalCid`,
  /** Append `/uuid/tree` for tree to fetch.
   * The `tree` string does nothing but satisfy an old param requirement.
  */
  retrieveTree: `${NODES_API_URL}/v1/data/retrieveTree`,
  moveData: `${NODES_API_URL}/v1/data/move`,
  createDraft: `${NODES_API_URL}/v1/nodes/createDraft`,
  /** Append /uuid with node to delete */
  deleteDraft: `${NODES_API_URL}/v1/nodes`,
  /** Append /uuid for node to show */
  showNode: `${NODES_API_URL}/v1/nodes/objects`,
  listNodes: `${NODES_API_URL}/v1/nodes`,
  prepublish: `${NODES_API_URL}/v1/nodes/prepublish`,
  publish: `${NODES_API_URL}/v1/nodes/publish`,
  /** Append `/uuid` for fetching document, `/uuid/actions` to mutate */
  documents: `${NODES_API_URL}/v1/nodes/documents`,
  /** Append /uuid for node to fetch publish history for */
  dpidHistory: `${NODES_API_URL}/v1/pub/versions`,
} as const;

export type CreateDraftParams = {
  title: string,
  // Some desci-server code expects these arrays to exist
  links: {
    pdf: string[],
    metadata: string[],
  },
  defaultLicense: License,
  researchFields: ResearchField[],
};

export type CreateDraftResponse = {
  ok: boolean,
  hash: string,
  uri: string,
  node: NodeResponse,
  version: NodeVersion,
  documentId: string,
};

export const createDraftNode = async (
  params: Omit<CreateDraftParams, "links">,
): Promise<CreateDraftResponse> => {
  const payload: CreateDraftParams = {
    ...params,
    links: {
      pdf: [],
      metadata: [],
    },
  };
  const { data } = await axios.post<CreateDraftResponse>(
    ROUTES.createDraft, payload, { headers: getHeaders() }
  );

  return data;
};

export type ListedNode = {
  uuid: string,
  id: string,
  createdAt: string,
  updatedAt: string,
  ownerId: number,
  title: string,
  manifestUrl: string,
  isPublished: boolean,
  cid: string,
  NodeCover: any[],
  index?: IndexedNode[],
};

/**
 * List nodes for the authenticated user.
*/
export const listNodes = async (
): Promise<ListedNode[]> => {
  const { data } = await axios.get<{nodes: ListedNode[]}>(
    ROUTES.listNodes + "/", { headers: getHeaders() }
  );

  return data.nodes;
};

export const deleteDraftNode = async (
  uuid: string,
): Promise<void> => {
  return await axios.delete(
    ROUTES.deleteDraft + `/${uuid}`,
    { headers: getHeaders() }
  );
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
  manifestData: ResearchObjectV1,
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
): Promise<NodeResponse> => {
  const { data } = await axios.get<NodeResponse>(
    ROUTES.showNode + `/${uuid}`,
    { headers: getHeaders(), }
  );

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
 * @param  - Your API key.
*/
export const prePublishDraftNode = async (
  uuid: string,
): Promise<PrepublishResponse> => {
  // Compute the draft drive DAG, and update the data bucket CID
  const { data } = await axios.post<PrepublishResponse>(
    ROUTES.prepublish,
    { uuid },
    { headers: getHeaders(), }
  );

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
): Promise<PublishResponse> => {
  const publishResult = await publish(uuid);

  const pubParams: PublishParams = {
    uuid,
    cid: publishResult.cid,
    manifest: publishResult.manifest,
    transactionId: publishResult.transactionId,
    ceramicStream: publishResult.ceramicIDs?.streamID,
  };

  let data: { ok: boolean };
  try {
    const backendPublishResult = await axios.post<{ok: boolean}>(
      ROUTES.publish,
      pubParams,
      { headers: getHeaders(), }
    );
    data = backendPublishResult.data;
  } catch (e) {
    console.log(`Publish flow was successful, but backend update failed for uuid ${uuid}.`);
    throw e;
  }

  return { 
    ...data,
    ceramicIDs: publishResult.ceramicIDs,
    updatedManifestCid: publishResult.cid
  };
};

export type DeleteDataParams = {
  uuid: string,
  path: string,
};

export type DeleteDataResponse = {
  manifest: ResearchObjectV1;
  manifestCid: string;
};

export const deleteData = async (
  params: DeleteDataParams,
) => {
  const { data } = await axios.post<DeleteDataResponse>(
    ROUTES.deleteData,
    {
      ...params,
      path: makeAbsolutePath(params.path),
    },
    { headers: getHeaders() }
  );

  return data;
};

export type MoveDataParams = {
  uuid: string,
  oldPath: string,
  newPath: string,
};

export type MoveDataResponse = {
  manifest: ResearchObjectV1,
  manifestCid: string,
};

export const moveData = async (
  params: MoveDataParams,
) => {
  const { data } = await axios.post<MoveDataResponse>(
    ROUTES.moveData,
    {
      ...params,
      oldPath: makeAbsolutePath(params.oldPath),
      newPath: makeAbsolutePath(params.newPath),
    },
    { headers: getHeaders() }
  );

  return data;
};

export type RetrieveResponse = {
  status?: number;
  tree: DriveObject[];
  date: string;
};

export const retrieveDraftFileTree = async (
  uuid: string,
) => {
  const { data } = await axios.get<RetrieveResponse>(
    ROUTES.retrieveTree + `/${uuid}/tree`, { headers: getHeaders() }
  );

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
) => {
  const { uuid, folderName, locationPath } = params;
  const form = new FormData();
  form.append("uuid", uuid);
  form.append("newFolderName", folderName);
  form.append("contextPath", makeAbsolutePath(locationPath));
  const { data } = await axios.post<CreateFolderResponse>(
    ROUTES.updateData, form, { headers: getHeaders(true)}
  );

  return data;
};

/** Params needed to upload a set of files */
export type UploadParams = {
  /** ID of target node */
  uuid: string,
  /**
   * Absolute path to target location in drive.
   * Note that folders must already exist.
  */
  targetPath: string,
  /** Local paths to files for upload */
  localFilePaths: string[],
};

export type UploadFilesResponse = {
  manifest: ResearchObjectV1,
  manifestCid: string,
  tree: DriveObject[],
  date: string,
};

export const uploadFiles = async (
  params: UploadParams,
): Promise<UploadFilesResponse> => {
  const { targetPath, localFilePaths, uuid } = params;
  const form = new FormData();
  form.append("uuid", uuid);
  form.append("contextPath", makeAbsolutePath(targetPath));

  localFilePaths.forEach(f => {
    const stream = createReadStream(f);
    form.append("files", stream);
  });

  const { data } = await axios.post<UploadFilesResponse>(
    ROUTES.updateData, form, { headers: getHeaders(true)}
  );

  return data;
};

/** Upload an externally hosted PDF file */
export type UploadPdfFromUrlParams = {
  /** ID of target node */
  uuid: string,
  /** Web URL to the target document, and its filename */
  externalUrl: ExternalUrl,
  /** Target path in the drive (folders must exist beforehand) */
  targetPath: string,
  /** What type of document the target file is */
  componentSubtype: ResearchObjectComponentDocumentSubtype,
};

/**
 * Reference to externally hosted data to upload. Capable of handling
 * pdf or github repos at the moment.
*/
export type ExternalUrl = {
  /** Web URL to the target resource */
  url: string,
  /** Name of the file or code repo */
  path: string,
};

/**
 * Upload a PDF hosted elsewhere. Backend automatically creates a matching
 * component which allows setting metadata.
*/
export const uploadPdfFromUrl = async (
  params: UploadPdfFromUrlParams,
): Promise<UploadFilesResponse> => {
  const { uuid, targetPath, externalUrl, componentSubtype } = params;
  const form = new FormData();
  form.append("uuid", uuid);
  form.append("contextPath", makeAbsolutePath(targetPath));
  form.append("externalUrl", JSON.stringify(externalUrl));
  form.append("componentType", ResearchObjectComponentType.PDF);
  form.append("componentSubtype", componentSubtype);
  const { data } = await axios.post<UploadFilesResponse>(
    ROUTES.updateData, form, { headers: getHeaders(true)}
  );
  return data
}

export type UploadGithubRepoFromUrlParams = {
  /** ID of target node */
  uuid: string,
  /** Web URL to the target repo, and its name */
  externalUrl: ExternalUrl,
  /** Target path in the drive (folders must exist beforehand) */
  targetPath: string,
  /** What type of code the repo contains */
  componentSubtype: ResearchObjectComponentCodeSubtype,
};

export const uploadGithubRepoFromUrl = async (
  params: UploadGithubRepoFromUrlParams,
): Promise<UploadFilesResponse> => {
  const { uuid, externalUrl, targetPath, componentSubtype } = params;
  const form = new FormData();
  form.append("uuid", uuid);
  form.append("contextPath", makeAbsolutePath(targetPath));
  form.append("externalUrl", JSON.stringify(externalUrl));
  form.append("componentType", ResearchObjectComponentType.CODE);
  form.append("componentSubtype", componentSubtype);
  const { data } = await axios.post<UploadFilesResponse>(
    ROUTES.updateData, form, { headers: getHeaders(true)}
  );
  return data;
};

export type AddExternalTreeParams = {
  uuid: string,
  externalCids: { name: string, cid: string }[],
  targetPath: string,
  componentType: ResearchObjectComponentType,
  componentSubtype: ResearchObjectComponentSubtypes,
};

/**
 * Add a publicly available UnixFS tree to the drive, without uploading
 * the content.
*/
export const addExternalUnixFsTree = async (
  params: AddExternalTreeParams,
): Promise<UploadFilesResponse> => {
  const { data } = await axios.post<UploadFilesResponse>(
    ROUTES.updateExternalCid,
    { ...params, contextPath: makeAbsolutePath(params.targetPath)},
    { headers: getHeaders() },
  );
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
  const { data } = await axios.get<IndexedNode>(
    ROUTES.dpidHistory + `/${uuid}`
  );

  return data.versions;
};

export type ChangeManifestParams = {
  uuid: string,
  actions: ManifestActions[],
};

export type ManifestDocumentResponse = {
  documentId: string,
  document: ResearchObjectDocument,
};

const getManifestDocument = async (
  uuid: string,
): Promise<ManifestDocumentResponse> => {
  const { data } = await axios.get<ManifestDocumentResponse>(
    ROUTES.documents + `/${uuid}`
  );

  return data;
};

/**
 * Send a generic manifest change to the backend. Normally, one of the
 * special-purpose functions is easier to use.
 * @param uuid - ID of the node
 * @param actions - series of change actions to perform
 * @param  - your API key or session token
 * @returns the new state of the manifest document
*/
export const changeManifest = async (
  uuid: string,
  actions: ManifestActions[],
): Promise<ManifestDocumentResponse> => {
  let actionResponse: AxiosResponse<ManifestDocumentResponse, any>;
  try {
    actionResponse = await axios.post<ManifestDocumentResponse>(
      ROUTES.documents + `/${uuid}/actions`,
      { actions },
      { headers: getHeaders() }
    );
  } catch (e) {
    const err = e as AxiosError
    // Node doesn't have an automerge document, needs initialization
    if (err.status === 400 && err.message.toLowerCase().includes("missing automerge document")) {
      await getManifestDocument(uuid);
      return await changeManifest(uuid, actions);
    } else {
      throw e;
    };
  };

  return actionResponse.data;
};

export type ComponentParam =
  | PdfComponent
  | ExternalLinkComponent
  | DataComponent
  | CodeComponent;

/**
 * Creates a new component in the node.
 * @param uuid - ID of the node
 * @param params - component to add
 * @param  - your API key or session token
 * @returns the new state of the manifest document
*/
export const addRawComponent = async (
  uuid: string,
  params: ComponentParam,
): Promise<ManifestDocumentResponse> => {
  const action: ManifestActions = {
    type: "Add Component",
    component: params,
  };
  return await changeManifest(uuid, [action]);
};

/**
 * Update the content of a component.
*/
export type UpdateComponentParams = {
  /** The new component data */
  component: ResearchObjectV1Component,
  /** Which component index to update */
  componentIndex: number,
};

export const updateComponent = async (
  uuid: string,
  params: UpdateComponentParams,
): Promise<ManifestDocumentResponse> => {
  const { component, componentIndex } = params;
  const action: ManifestActions = {
    type: "Update Component",
    component,
    componentIndex,
  };
  return await changeManifest(uuid, [action]);
};

/** Parameters for adding an external link component to manifest */
export type AddLinkComponentParams = {
  /** Human-readable name of component */
  name: string,
  /** Link component refers to */
  url: string,
  /** Which type of resource the link points to */
  subtype: ResearchObjectComponentLinkSubtype,
  /** Wether to show the link as a central component of the object */
  starred: boolean,
};

export const addLinkComponent = async (
  uuid: string,
  params: AddLinkComponentParams,
): Promise<ManifestDocumentResponse> => {
  const fullParams: ExternalLinkComponent = {
    id: randomUUID(),
    name: params.name,
    type: ResearchObjectComponentType.LINK,
    subtype: params.subtype,
    payload: {
      url: params.url,
      path: `root/External Links/${params.name}`,
    },
    starred: params.starred
  };
  return await addRawComponent(uuid, fullParams);
}

/**
 * Parameters for adding a PDF component to manifest. This is done after
 * uploading the file, and allows adding richer metadata to the document.
*/
export type AddPdfComponentParams = {
  /** Human-readable name of the document */
  name: string,
  /** Absolute path to the file in the drive */
  pathToFile: string,
  /** CID of the file */
  cid: string,
  /** Indicates the type of document */
  subtype: ResearchObjectComponentDocumentSubtype,
  /** Wether to show the document as a central component of the object */
  starred: boolean,
};

export const addPdfComponent = async (
  uuid: string,
  params: AddPdfComponentParams,
): Promise<ManifestDocumentResponse> => {
  const fullParams: PdfComponent = {
    id: randomUUID(),
    name: params.name,
    type: ResearchObjectComponentType.PDF,
    subtype: params.subtype,
    payload: {
      cid: params.cid,
      path: makeAbsolutePath(params.pathToFile),
    },
    starred: params.starred,
  };
  return await addRawComponent(uuid, fullParams);
};

/**
 * Parameters for adding code component to manifest. These can be
 * nested in layers to mark subdirectories as other types of code, etc.
*/
export type AddCodeComponentParams = {
  /** Human-readable name of the code collection */
  name: string,
  /** Absolute path to the code in the drive */
  path: string,
  /** CID of the target file or unixFS directory */
  cid: string,
  /** */
  language: string,
  /** Indicates the type of document */
  subtype: ResearchObjectComponentCodeSubtype,
  /** Wether to show the document as a central component of the object */
  starred: boolean,
};

/**
 * Manually add a code component to mark a subtree of the drive as code.
*/
export const addCodeComponent = async (
  uuid: string,
  params: AddCodeComponentParams,
): Promise<ManifestDocumentResponse> => {
  const fullParams: CodeComponent = {
    id: randomUUID(),
    name: params.name,
    type: ResearchObjectComponentType.CODE,
    subtype: params.subtype,
    payload: {
      language: params.language,
      path: makeAbsolutePath(params.path),
      cid: params.cid,
    },
    starred: params.starred,
  };
  return await addRawComponent(uuid, fullParams);
};

export const deleteComponent = async (
  uuid: string,
  path: string,
): Promise<ManifestDocumentResponse> => await changeManifest(
  uuid, [{ type: "Delete Component", path: makeAbsolutePath(path)}]);

export const updateTitle = async (
  uuid: string,
  title: string,
): Promise<ManifestDocumentResponse> =>
  await changeManifest(uuid, [{ type: "Update Title", title }]);

export const updateDescription = async (
  uuid: string,
  description: string,
): Promise<ManifestDocumentResponse> =>
  await changeManifest(uuid, [{ type: "Update Description", description }]);

export const updateLicense = async (
  uuid: string,
  license: License,
): Promise<ManifestDocumentResponse> =>
  await changeManifest(uuid, [{ type: "Update License", defaultLicense: license }]);

export const updateResearchFields = async (
  uuid: string,
  researchFields: ResearchField[],
): Promise<ManifestDocumentResponse> =>
  await changeManifest(uuid, [{ type: "Update ResearchFields", researchFields }]);

export const addContributor = async (
  uuid: string,
  author: ResearchObjectV1Author,
): Promise<ManifestDocumentResponse> =>
  await changeManifest(uuid, [{ type: "Add Contributor", author }]);

export const removeContributor = async (
  uuid: string,
  contributorIndex: number,
): Promise<ManifestDocumentResponse> =>
  await changeManifest(uuid, [{ type: "Remove Contributor", contributorIndex }]);

export const updateCoverImage = async (
  uuid: string,
  cid: string | undefined,
): Promise<ManifestDocumentResponse> =>
  await changeManifest(uuid, [{ type: "Update CoverImage", cid }]);

const getHeaders = (isFormData: boolean = false) => {
  const headers = {
    "api-key": NODES_API_KEY,
    ...(isFormData ? { "content-type": "multipart/form-data" } : {})
  };
  return headers;
};

const makeAbsolutePath = (path: string) => {
  // Sensible definitions of root
  if (!path || path === "root" || path === "root/") return "root";
  // Support unix-style absolute paths
  if (path.startsWith("/")) return `root${path}`;
  // What endpoints actually expect
  if (path.startsWith("root/")) return path;
  // Just add root to other paths
  return `root/${path}`;
};
