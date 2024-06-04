import {
  AxiosError,
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
import type { NodeIDs } from "@desci-labs/desci-codex-lib";
import { legacyPublish, publish } from "./publish.js";
import type { ResearchObjectDocument } from "./automerge.js";
import { randomUUID } from "crypto";
import { getNodesLibInternalConfig } from "./config/index.js";
import { makeRequest } from "./routes.js";
import { Signer } from "ethers";
import { type DID } from "dids";
import { getFullState } from "./codex.js";
import { convertUUIDToDecimal } from "./util/converting.js";

export const ENDPOINTS = {
  deleteData: {
    method: "post",
    route: `/v1/data/delete`,
    _payloadT: <DeleteDataParams>{},
    _responseT: <DeleteDataResponse>{},
  },
  uploadFiles: {
    method: "post",
    route: `/v1/data/update`,
    _payloadT: <UploadParams>{},
    _responseT: <UploadFilesResponse>{},
  },
  uploadExternal: {
    method: "post",
    route: `/v1/data/update`,
    _payloadT: <UploadPdfFromUrlParams | UploadGithubRepoFromUrlParams>{},
    _responseT: <UploadFilesResponse>{},
  },
  createFolder: {
    method: "post",
    route: `/v1/data/update`,
    _payloadT: <CreateFolderParams>{},
    _responseT: <CreateFolderResponse>{},
  },
  updateExternalCid: {
    method: "post",
    route: `/v1/data/updateExternalCid`,
    _payloadT: <AddExternalTreeParams>{},
    _responseT: <UploadFilesResponse>{},
  },
  /** Append `/[uuid]/tree` 
   * `tree` does nothing but a string needs to be there because of derp routing
  */
  retrieveTree: {
    method: "get",
    route: `/v1/data/retrieveTree`,
    _payloadT: undefined,
    _responseT: <RetrieveResponse>{},
  },
  moveData: {
    method: "post",
    route: `/v1/data/move`,
    _payloadT: <MoveDataParams>{},
    _responseT: <MoveDataResponse>{},
  },
  createDraft: {
    method: "post",
    route: `/v1/nodes/createDraft`,
    _payloadT: <CreateDraftParams>{},
    _responseT: <CreateDraftResponse>{},
  },
    /** Append `/[uuid]` */
  deleteDraft: {
    method: "delete",
    route: `/v1/nodes`,
    _payloadT: undefined,
    _responseT: undefined,
  },
  /** Append `/[uuid] `*/
  showNode: {
    method: "get",
    route: `/v1/nodes/objects`,
    _payloadT: undefined,
    _responseT: <NodeResponse>{},
  },
  listNodes: {
    method: "get",
    route: `/v1/nodes/`,
    _payloadT: undefined,
    _responseT: <{ nodes: ListedNode[] }>{},
  },
  prepublish: {
    method: "post",
    route: `/v1/nodes/prepublish`,
    _payloadT: <{ uuid: string }>{},
    _responseT: <PrepublishResponse>{},
  },
  publish: {
    method: "post",
    route: `/v1/nodes/publish`,
    _payloadT: <PublishParams>{},
    _responseT: <PublishResponse>{},
  },
  /** Append `/[uuid]` */
  getDocument: {
    method: "get",
    route: `/v1/nodes/documents`,
    _payloadT: undefined,
    _responseT: <ManifestDocumentResponse>{},
  },
  /** Append `/[uuid]/actions` */
  changeDocument: {
    method: "post",
    route: `/v1/nodes/documents`,
    _payloadT: <ChangeManifestParams>{},
    _responseT: <ManifestDocumentResponse>{},
  },
  createDpid: {
    method: "post",
    route: `/v1/nodes/createDpid`,
    _payloadT: <{ uuid: string }>{},
    _responseT: <{ dpid: number }>{},
  },
  /** Append `/[uuid] `*/
  dpidHistory: {
    method: "get",
    route: `/v1/pub/versions`,
    _payloadT: undefined,
    _responseT: <IndexedNode>{},
  },
} as const;

/**
 * Required parameters for creating a new draft node
*/
export type CreateDraftParams = {
  /** Human-readable title of the node */
  title: string,
  /** Must be included for backward compatibility */
  links: {
    pdf: string[],
    metadata: string[],
  },
  /** The license that should apply to the content of the node */
  defaultLicense: License,
  /** Research fields the node is associated with */
  researchFields: ResearchField[],
};

/**
 * Nodes backend response after creating a draft, containing information
 * about the state of the draft node.
*/
export type CreateDraftResponse = {
  ok: boolean,
  hash: string,
  uri: string,
  node: NodeResponse,
  version: NodeVersion,
  documentId: string,
};

/**
 * Create a new draft node, an empty base for further interaction. A draft
 * is the target of iterative file uploads, changes to metadata, etc and
 * remains private until the next call to `publishDraftNode`.
*/
export const createDraftNode = async (
  params: Omit<CreateDraftParams, "links">,
) => await makeRequest(
  ENDPOINTS.createDraft,
  getHeaders(),
  {
    ...params,
    links: {
      pdf: [],
      metadata: [],
    },
  }
);

/**
 * Information returned when listing user nodes, published and private drafts.
*/
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
 * List all nodes for the authenticated user.
*/
export const listNodes = async (
) => await makeRequest(
  ENDPOINTS.listNodes,
  getHeaders(),
  undefined,
);

/** Delete a draft node (note this will not prevent public resolution )*/
export const deleteDraftNode = async (
  uuid: string,
) => await makeRequest(
  ENDPOINTS.deleteDraft,
  getHeaders(),
  undefined,
  `/${uuid}`,
);

/**
 * Full state of a draft node as the backend is aware.
 *
 * Note that the data drive in the manifest, and hence
 * the manifest CID, may not reflect the actual drive state
 * until the node is published (or `prePublishDraftNode` is called).
*/
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

/**
 * Get the state of a draft node.
*/
export const getDraftNode = async (
  uuid: string,
) => await makeRequest(
  ENDPOINTS.showNode,
  getHeaders(),
  undefined,
  `/${uuid}`
);

/**
 * dPID publish history entry for a node.
*/
type NodeVersion = {
  id: number;
  manifestUrl: string;
  cid: string;
  transactionId: string | null;
  nodeId: number | null;
};

/**
 * Response from prepublishing a node, containing the drive CID
 * computed from draft state.
*/
export type PrepublishResponse = {
  ok: boolean;
  updatedManifestCid: string;
  updatedManifest: ResearchObjectV1;
  version?: NodeVersion;
  ceramicStream?: string;
};

export type PublishConfiguration = {
  signer: Signer
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
) => await makeRequest(
  ENDPOINTS.prepublish,
  getHeaders(),
  { uuid },
);

type PublishParams = {
  uuid: string,
  cid: string,
  manifest: ResearchObjectV1,
  transactionId?: string,
  nodeVersionId?: string,
  ceramicStream?: string,
  commitId?: string,
};

/** Result of publishing a draft node */
export type PublishResponse = {
  /** The updated manifest */
  updatedManifest: ResearchObjectV1,
  /** The new manifest CID, which could have changed from adding the dPID */
  updatedManifestCid: string,
  /** Ceramic stream and commit IDs from publishing to Codex */
  ceramicIDs?: NodeIDs,
  /** dPID transaction ID */
  dpidTxId?: string
};

/**
 * Publish a node, meaning compile the state of the drive into an actual
 * IPLD DAG, make the IPFS CID's public, publish the references to Codex
 * and create a dPID alias for it.
 *
 * @param uuid - UUID of the node to publish
 * @param didOrSigner - authenticated did-session DID, or a generic signer
*/
export const publishNode = async (
  uuid: string,
  didOrSigner: DID | Signer,
): Promise<PublishResponse> => {
  const publishResult = await publish(uuid, didOrSigner);
  const pubParams: PublishParams = {
    uuid,
    cid: publishResult.cid,
    manifest: publishResult.manifest,
    ceramicStream: publishResult.ceramicIDs.streamID,
    commitId: publishResult.ceramicIDs.commitID,
    // required in DB & this string is used to detect non-tx's in publish worker
    transactionId: "ceramic",
  };

  try {
    await makeRequest(ENDPOINTS.publish, getHeaders(), pubParams);
  } catch (e) {
    console.log(`Publish successful, but backend update failed for node ${uuid}`);
    throw e;
  };

  let dpid;
  try {
    dpid = await createDpid(uuid);
    await changeManifest(
      uuid,
      [{
        type: "Publish Dpid",
        dpid: { prefix: "", id: dpid.toString() }
      }],
    );
  } catch (e) {
    console.log(`Failed to create dPID alias for node ${uuid}...`);
  };

  return {
    ceramicIDs: publishResult.ceramicIDs,
    updatedManifest: publishResult.manifest,
    updatedManifestCid: publishResult.cid,
  };
};

/**
 * Create a new dPID in the alias registry. Only possible to do once per node.
 *
 * @param uuid - UUID of the node to mint a dPID
 * @throws on dPID minting failure
*/
export const createDpid = async (
  uuid: string,
): Promise<number> => {
  let dpid: number;
  try {
    const res = await makeRequest(ENDPOINTS.createDpid, getHeaders(), { uuid });
    dpid = res.dpid;
  } catch (e) {
    console.log(`Couldn't create dPID alias for node ${uuid}`)
    throw e;
  };
  return dpid;
};

/**
 * Publish a draft node, meaning to compile the state of the drive into an
 * actual IPLD DAG, make the IPFS CIDs public, and register the node on
 * the dPID registry and Codex.
 *
 * @param uuid - UUID of node to publish
 * @param signer - Signer to use for publish, if not set with env
 * @throws (@link WrongOwnerError) if signer address isn't research object token owner
 * @throws (@link DpidPublishError) if dPID couldnt be registered or updated
 * @depreated use publishNode instead, as this function uses the old on-chain registry
*/
export const publishDraftNode = async (
  uuid: string,
  signer: Signer,
  did?: DID,
): Promise<PublishResponse> => {
  const publishResult = await legacyPublish(uuid, signer, did);

  const pubParams: PublishParams = {
    uuid,
    cid: publishResult.cid,
    manifest: publishResult.manifest,
    transactionId: publishResult.transactionId,
    ceramicStream: publishResult.ceramicIDs?.streamID,
    commitId: publishResult.ceramicIDs?.commitID,
  };

  try {
    await makeRequest(ENDPOINTS.publish, getHeaders(), pubParams);
  } catch (e) {
    console.log(`Publish flow was successful, but backend update failed for uuid ${uuid}.`);
    throw e;
  };

  return { 
    ceramicIDs: publishResult.ceramicIDs,
    dpidTxId: publishResult.transactionId,
    updatedManifest: publishResult.manifest,
    updatedManifestCid: publishResult.cid,
  };
};

/** Parameters required for deleting a drive entry */
export type DeleteDataParams = {
  /** The node to delete from */
  uuid: string,
  /** (absolute) drive path to delete. Can be a directory. */
  path: string,
};

/** Response from a delete operation, where components may have been removed */
export type DeleteDataResponse = {
  /** The new state of the manifest */
  manifest: ResearchObjectV1;
  /** New CID of the manifest */
  manifestCid: string;
};

/**
 * Delete a file or directory from the drive. This also removes related
 * component entries in the manifest.
*/
export const deleteData = async (
  params: DeleteDataParams,
) => await makeRequest(
  ENDPOINTS.deleteData,
  getHeaders(),
  params,
);

/** Parameters required for moving data in the drive */
export type MoveDataParams = {
  /** The node to move data in */
  uuid: string,
  /** The path of the data to move */
  oldPath: string,
  /** The new location of the data */
  newPath: string,
};

/** Response from a move operation, where components may have been updated */
export type MoveDataResponse = {
  manifest: ResearchObjectV1,
  manifestCid: string,
};

/**
 * Move a file or directory inside the drive. This will also update related
 * components associated with the paths.
*/
export const moveData = async (
  params: MoveDataParams,
) => await makeRequest(
  ENDPOINTS.moveData,
  getHeaders(),
  params,
);

/** Response from retrieving the state of the drive tree */
export type RetrieveResponse = {
  /** Status code of the retrieval */
  status?: number;
  /** Recursive structure describing the drive state */
  tree: DriveObject[];
  /** The timestamp of latest drive change */
  date: string;
};

/**
 * Get the state of the drive tree of a draft node.
 *
 * Note this may be different from the published version.
*/
export const retrieveDraftFileTree = async (
  uuid: string,
) => await makeRequest(
  ENDPOINTS.retrieveTree,
  getHeaders(),
  undefined,
  `/${uuid}/tree`,
);

/** Parameters required for creating a new directory in the drive */
export type CreateFolderParams = {
  /** The node to create a new folder in */
  uuid: string,
  /** The location of the new folder (UNIX `dirname`) */
  contextPath: string,
  /** The name of the new folder (UNIX `basename`) */
  newFolderName: string,
};

/** Response from creating a new directory */
export type CreateFolderResponse = {
  /** The new state of the manifest */
  manifest: ResearchObjectV1,
  /** The new manifest CID */
  manifestCid: string,
  /** The new state of the drive tree */
  tree: DriveObject[],
  /** Timestamp of the change */
  date: string,
};

/**
 * Create a new, empty directory in the node drive tree.
*/
export const createNewFolder = async (
  params: CreateFolderParams,
) => {
  const { uuid, newFolderName, contextPath } = params;
  const form = new FormData();
  form.append("uuid", uuid);
  form.append("newFolderName", newFolderName);
  form.append("contextPath", makeAbsolutePath(contextPath));
  return await makeRequest(
    ENDPOINTS.createFolder,
    getHeaders(true),
    // Formdata equivalent
    form as unknown as CreateFolderParams,
  );
};

/** Parameters required to upload a set of files */
export type UploadParams = {
  /** The node to upload files to */
  uuid: string,
  /**
   * Absolute path to target location in drive.
   * Note that folders must already exist.
  */
  contextPath: string,
  /** Local paths to files for upload */
  files: string[],
};

/**
 * Response from uploading files
*/
export type UploadFilesResponse = {
  /** The new state of the manifest */
  manifest: ResearchObjectV1,
  /** The new manifest CID */
  manifestCid: string,
  /** The new state of the drive tree */
  tree: DriveObject[],
  /** Timestamp of the change */
  date: string,
};

/**
 * Upload a set of files to the node drive.
 *
 * Note that these do not become public until `publishDraftNode` has been
 * called, even if the node has previously been published.
*/
export const uploadFiles = async (
  params: UploadParams,
) => {
  const { contextPath, files, uuid } = params;
  const form = new FormData();
  form.append("uuid", uuid);
  form.append("contextPath", makeAbsolutePath(contextPath));

  files.forEach(f => {
    const stream = createReadStream(f);
    form.append("files", stream);
  });

  return await makeRequest(
    ENDPOINTS.uploadFiles,
    getHeaders(true),
    // Formdata equivalent
    form as unknown as UploadParams
  );
};

/** Parameters required for uploading an externally hosted PDF file */
export type UploadPdfFromUrlParams = {
  /** The node to uppload the document to */
  uuid: string,
  /** Web URL to the target document, and its filename */
  externalUrl: ExternalUrl,
  /** Target path in the drive (folders must already exist) */
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
  /** **Name** of the file or code repo (not the full path) */
  path: string,
};

/**
 * Upload a PDF hosted elsewhere. Backend automatically creates a matching
 * component for attaching metadata.
*/
export const uploadPdfFromUrl = async (
  params: UploadPdfFromUrlParams,
) => {
  const { uuid, targetPath, externalUrl, componentSubtype } = params;
  const form = new FormData();
  form.append("uuid", uuid);
  form.append("contextPath", makeAbsolutePath(targetPath));
  form.append("externalUrl", JSON.stringify(externalUrl));
  form.append("componentType", ResearchObjectComponentType.PDF);
  form.append("componentSubtype", componentSubtype);

  return await makeRequest(
    ENDPOINTS.uploadFiles,
    getHeaders(true),
    // Formdata equivalent
    form as unknown as UploadParams,
  );
};

/** Parameters required for uploading an external GitHub code repository */
export type UploadGithubRepoFromUrlParams = {
  /** The node to upload the repo to */
  uuid: string,
  /** Web URL to the target repo, and its name */
  externalUrl: ExternalUrl,
  /** Target path in the drive (folders must exist beforehand) */
  targetPath: string,
  /** What type of code the repo contains */
  componentSubtype: ResearchObjectComponentCodeSubtype,
};

/**
 * Clone an entire GitHub repository to the node, effectively creating
 * an immutable copy of it.
*/
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
  return await makeRequest(
    ENDPOINTS.uploadFiles,
    getHeaders(true),
    // Formdata equivalent
    form as unknown as UploadParams,
  );
};

/** Parameters requried for adding an externally pinned file or UnixFS tree */
export type AddExternalTreeParams = {
  /** The node to add the data to */
  uuid: string,
  /** Which external CIDs to include, and their associated names in the drive */
  externalCids: { name: string, cid: string }[],
  /** The absolute path in the drive where the entries should be */
  contextPath: string,
  /** The type of the imported data */
  componentType: ResearchObjectComponentType,
  /** The subtype of the imported data */
  componentSubtype: ResearchObjectComponentSubtypes,
};

/**
 * Add a publicly available file or UnixFS tree CID to the drive, without
 * the content. This data will not be pinned by the Nodes backend, and
 * it's availability depends on other pinners.
*/
export const addExternalCid = async (
  params: AddExternalTreeParams,
) => await makeRequest(
  ENDPOINTS.updateExternalCid,
  getHeaders(),
  {
    ...params,
    contextPath: makeAbsolutePath(params.contextPath),
  },
);

/** Historical log entry for a dPID */
export type IndexedNodeVersion = {
  /** Manifest CID in EVM format */
  cid: string;
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

export const getPublishHistory = async (
  uuid: string,
): Promise<IndexedNode> => {
  const { ceramicStream,} = await getDraftNode(uuid);

  if (!ceramicStream) {
    return await getDpidHistory(uuid);
  };

  const resolved = await getFullState(ceramicStream);
  const versions = resolved.events.map(e => ({
    cid: e.cid.toString(),
    time: e.timestamp?.toString() || "", // May happen if commit is not anchored
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

/**
 * Get the dPID publish history for a node.
 * @deprecated use getPublishHistory
*/
export const getDpidHistory = async (
  uuid: string,
) => await makeRequest(
  ENDPOINTS.dpidHistory,
  getHeaders(),
  undefined,
  `/${uuid}`,
);

/** Parameters requried for changing the manifest */
export type ChangeManifestParams = {
  /** One or more actions to perform */
  actions: ManifestActions[],
};

/** Response from a manifest change request */
export type ManifestDocumentResponse = {
  /** The (internal) automerge ID of the manifest */
  documentId: string,
  /** The state of the manifest document */
  document: ResearchObjectDocument,
};

/**
 * Get the raw state of the node manifest. To support multiple clients, the
 * Nodes backend represents it as an automerge document and not raw JSON.
*/
const getManifestDocument = async (
  uuid: string,
) => await makeRequest(
  ENDPOINTS.getDocument,
  getHeaders(),
  undefined,
  `/${uuid}`
);

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
  let documentResponse: ManifestDocumentResponse;
  try {
    documentResponse = await makeRequest(
      ENDPOINTS.changeDocument,
      getHeaders(),
      { actions },
      `/${uuid}/actions`
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

  return documentResponse;
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

/**
 * Add an external link to the node.
*/
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

/**
 * Add a PDF component to the manifest, allowing setting metadata on a
 * PDF file added to the drive.
*/
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

/** Delete a component from the manifest */
export const deleteComponent = async (
  uuid: string,
  path: string,
): Promise<ManifestDocumentResponse> => await changeManifest(
  uuid, [{ type: "Delete Component", path: makeAbsolutePath(path)}]);

/** Update the node title */
export const updateTitle = async (
  uuid: string,
  title: string,
): Promise<ManifestDocumentResponse> =>
  await changeManifest(uuid, [{ type: "Update Title", title }]);

/** Update the node description */
export const updateDescription = async (
  uuid: string,
  description: string,
): Promise<ManifestDocumentResponse> =>
  await changeManifest(uuid, [{ type: "Update Description", description }]);

 /** Update the default license of the node */
export const updateLicense = async (
  uuid: string,
  license: License,
): Promise<ManifestDocumentResponse> =>
  await changeManifest(uuid, [{ type: "Update License", defaultLicense: license }]);

/** Update the research fields of the node */
export const updateResearchFields = async (
  uuid: string,
  researchFields: ResearchField[],
): Promise<ManifestDocumentResponse> =>
  await changeManifest(uuid, [{ type: "Update ResearchFields", researchFields }]);

/** Add a contributor to the node */
export const addContributor = async (
  uuid: string,
  author: ResearchObjectV1Author,
): Promise<ManifestDocumentResponse> =>
  await changeManifest(uuid, [{ type: "Add Contributor", author }]);

/** Remove a contributor from the node */
export const removeContributor = async (
  uuid: string,
  contributorIndex: number,
): Promise<ManifestDocumentResponse> =>
  await changeManifest(uuid, [{ type: "Remove Contributor", contributorIndex }]);

/** Set or unset the cover image of the node */
export const updateCoverImage = async (
  uuid: string,
  cid: string | undefined,
): Promise<ManifestDocumentResponse> =>
  await changeManifest(uuid, [{ type: "Update CoverImage", cid }]);

const getHeaders = (isFormData: boolean = false) => {
  const headers = {
    "api-key": getNodesLibInternalConfig().apiKey,
    ...(isFormData ? { "content-type": "multipart/form-data" } : {})
  };
  return headers;
};

/**
 * Best-effort way of ensuring reasonable representations of absolute paths
 * gets wrangled into the `root/`-prefixed string the API's/manifest expect.
*/
export const makeAbsolutePath = (path: string) => {
  // Sensible definitions of root
  const ROOT_ALIASES = [ "root", "root/", "/" ];
  if (!path || ROOT_ALIASES.includes(path)) return "root";

  // Support unix-style absolute paths
  if (path.startsWith("/")) return `root${path}`;

  // What endpoints actually expect
  if (path.startsWith("root/")) return path;

  // Just add root to other paths
  return `root/${path}`;
};
