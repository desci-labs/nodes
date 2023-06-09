import { randomUUID } from 'crypto';

import {
  CommonComponentPayload,
  DataComponentMetadata,
  ResearchObjectComponentSubtypes,
  ResearchObjectComponentType,
  ResearchObjectV1,
  ResearchObjectV1Component,
} from '@desci-labs/desci-models';
import { DataReference, DataType } from '@prisma/client';

import prisma from 'client';
import { DataReferenceSrc } from 'controllers/data';
import { FileDir, getDirectoryTree, RecursiveLsResult } from 'services/ipfs';

export function recursiveFlattenTreeFilterDirs(tree) {
  const flat = [];
  tree.forEach((branch) => {
    if ('contains' in branch) {
      flat.push(branch);
      flat.push(...recursiveFlattenTreeFilterDirs(branch.contains));
    }
  });

  return flat;
}

export const recursiveFlattenTree = (
  tree: RecursiveLsResult[] | DriveObject[],
): RecursiveLsResult[] | DriveObject[] => {
  const contents = [];
  tree.forEach((fd) => {
    contents.push(fd);
    if (fd.type === 'dir' && fd.contains) {
      contents.push(...recursiveFlattenTree(fd.contains));
    }
  });
  return contents;
};

export function fillDirSizes(tree, cidInfoMap) {
  const contains = [];
  tree.forEach((fd) => {
    if (fd.type === 'dir') {
      fd.size = cidInfoMap[fd.cid]?.size || 0;
      fd.contains = fillDirSizes(fd.contains, cidInfoMap);
    }
    // debugger
    fd.date = cidInfoMap[fd.cid]?.date || Date.now();
    fd.published = cidInfoMap[fd.cid]?.published;
    contains.push(fd);
  });
  return contains;
}

// Fills in the access status of CIDs and dates
export function fillCidInfo(tree, cidInfoMap) {
  const contains = [];
  tree.forEach((fd) => {
    if (fd.type === 'dir') fd.contains = fillCidInfo(fd.contains, cidInfoMap);
    fd.date = cidInfoMap[fd.cid]?.date || Date.now();
    fd.published = cidInfoMap[fd.cid]?.published;
    contains.push(fd);
  });
  return contains;
}

interface CidEntryDetails {
  size?: number;
  published?: boolean;
  date?: string;
}

//deprecate this, use for old tree
export async function getTreeAndFill(rootCid: string, nodeUuid: string, dataSrc: DataReferenceSrc, ownerId?: number) {
  //NOTE/TODO: Adapted for priv(owner) and public (unauthed), may not work for node sharing users(authed/contributors)
  const externalCidMap = await generateExternalCidMap(nodeUuid + '.');
  const tree: RecursiveLsResult[] = await getDirectoryTree(rootCid, externalCidMap);

  /*
   ** Get all entries for the nodeUuid, for filling the tree
   */
  const dbEntries =
    dataSrc === DataReferenceSrc.PRIVATE
      ? await prisma.dataReference.findMany({
          where: {
            userId: ownerId,
            type: { not: DataType.MANIFEST },
            rootCid: rootCid,
            // cid: { in: dirCids },
            node: {
              uuid: nodeUuid + '.',
            },
          },
        })
      : await prisma.publicDataReference.findMany({
          where: {
            type: { not: DataType.MANIFEST },
            // cid: { in: dirCids },
            // rootCid: rootCid,
            node: {
              uuid: nodeUuid + '.',
            },
          },
        });

  // Necessary to determine if any private entries are already published
  const pubEntries =
    dataSrc === DataReferenceSrc.PRIVATE
      ? await prisma.publicDataReference.findMany({
          where: {
            type: { not: DataType.MANIFEST },
            node: {
              uuid: nodeUuid + '.',
            },
          },
        })
      : null;

  const cidInfoMap: Record<string, CidEntryDetails> = {};
  if (dbEntries.length) {
    const pubCids = pubEntries ? pubEntries.map((e) => e.cid) : null;
    // debugger
    dbEntries.forEach((d) => {
      const isPublished = dataSrc === DataReferenceSrc.PUBLIC ? true : pubCids.includes(d.cid);
      const entryDetails = {
        size: d.size || 0,
        published: isPublished,
        date: d.createdAt?.toString(),
        external: d.external ? true : false,
      };
      cidInfoMap[d.cid] = entryDetails;
    });
  }

  const filledTree = fillDirSizes(tree, cidInfoMap);

  return filledTree;
}

/*
 ** TREE FUNCS START, MOVE OUT TO MODELS
 */
export async function getTreeAndFillV2(manifest: ResearchObjectV1, nodeUuid: string, ownerId?: number) {
  const rootCid = manifest.components.find((c) => c.type === ResearchObjectComponentType.DATA_BUCKET).payload.cid;
  const externalCidMap = await generateExternalCidMap(nodeUuid + '.');
  let tree: RecursiveLsResult[] = await getDirectoryTree(rootCid, externalCidMap);

  /*
   ** Get all entries for the nodeUuid, for filling the tree
   ** Both entries neccessary to determine publish state, prioritize public entries over private
   */
  const privEntries = await prisma.dataReference.findMany({
    where: {
      userId: ownerId,
      type: { not: DataType.MANIFEST },
      rootCid: rootCid,
      node: {
        uuid: nodeUuid + '.',
      },
    },
  });
  const pubEntries = await prisma.publicDataReference.findMany({
    where: {
      type: { not: DataType.MANIFEST },
      node: {
        uuid: nodeUuid + '.',
      },
    },
  });

  const cidInfoMap: Record<string, CidEntryDetails> = {};
  if (privEntries.length | pubEntries.length) {
    const pubCids: Record<string, boolean> = {};
    pubEntries.forEach((e) => (pubCids[e.cid] = true));

    // Build cidInfoMap
    privEntries.forEach((ref) => {
      if (pubCids[ref.cid]) return; // Skip if there's a pub entry
      const entryDetails = {
        size: ref.size || 0,
        published: false,
        date: ref.createdAt?.toString(),
        external: ref.external ? true : false,
      };
      cidInfoMap[ref.cid] = entryDetails;
    });
    pubEntries.forEach((ref) => {
      const entryDetails = {
        size: ref.size || 0,
        published: true,
        date: ref.createdAt?.toString(),
        external: ref.external ? true : false,
      };
      cidInfoMap[ref.cid] = entryDetails;
    });
  }

  const treeRoot = createVirtualDrive({
    name: 'Node Root',
    componentType: ResearchObjectComponentType.DATA_BUCKET,
    path: DRIVE_NODE_ROOT_PATH,
    contains: [],
  });

  tree = fillCidInfo(tree, cidInfoMap);

  //Generate a map of existing components
  const pathToCompMap = generatePathCompMap(manifest);
  const pathToDriveMap = generateFlatPathDriveMap(tree as DriveObject[]);
  const pathToSizeMap = generatePathSizeMap(pathToDriveMap); //Sources dir sizes

  const driveObjectTree = convertIpfsTreeToDriveObjectTree(tree as DriveObject[], pathToCompMap, pathToSizeMap);

  return driveObjectTree;
}

export function getAncestorComponent(
  drive: DriveObject,
  pathToCompMap: Record<DrivePath, ResearchObjectV1Component>,
): ResearchObjectV1Component | null {
  const pathSplit = drive.path!.split('/');
  if (pathSplit.length < 3) return null;
  while (pathSplit.length > 1) {
    pathSplit.pop();
    const parentPath = pathSplit.join('/');
    const parent = pathToCompMap[parentPath];
    if (parent && parent.type !== ResearchObjectComponentType.UNKNOWN) {
      return parent;
    }
  }
  return null;
}

//Convert IPFS tree to DriveObject tree V2
export function convertIpfsTreeToDriveObjectTree(
  tree: DriveObject[],
  pathToCompMap: Record<DrivePath, ResearchObjectV1Component>,
  pathToSizeMap: Record<DrivePath, number>,
) {
  // tree = tree.filter((branch) => !FILTER_LIST.includes(branch.name)); // LEAVE THIS TO THE FRONTEND
  tree.forEach((branch) => {
    const fileDirBranch = branch as FileDir;
    const neutralPath = neutralizePath(branch.path!);
    branch.path = neutralPath;
    const component = pathToCompMap[branch.path!];
    const ancestorComponent: ResearchObjectV1Component | null = getAncestorComponent(branch, pathToCompMap);
    branch.componentType = component?.type || ancestorComponent?.type || ResearchObjectComponentType.UNKNOWN;

    if (component) {
      const subtype = 'subtype' in component ? (component['subtype'] as ResearchObjectComponentSubtypes) : undefined;
      if (subtype) branch.componentSubtype = subtype;
    }
    // useful for annotation insert on file tree under a code component for example (refer to component id later)
    branch.componentId = component?.id || ancestorComponent?.id;
    branch.accessStatus = fileDirBranch.published ? AccessStatus.PUBLIC : AccessStatus.PRIVATE;

    //Determine partials
    if (!fileDirBranch.published && branch.contains && branch.contains.length) {
      const isPartial = hasPublic(branch);
      if (isPartial) branch.accessStatus = AccessStatus.PARTIAL;
    }

    if (branch.external) branch.accessStatus = AccessStatus.EXTERNAL;

    branch.metadata = inheritMetadata(branch.path, pathToCompMap);
    branch.starred = component?.starred || false;
    // branch.uid = component?.id || uuidv4(); // PROBABLY SAFE TO EXCLUDE GOING FORWARD
    // branch.lastModified = formatDbDate(branch.lastModified) || tempDate; // LEAVE THIS TO FRONTEND
    if (branch.contains && branch.contains.length && branch.type === FileType.DIR) {
      branch.size = pathToSizeMap[branch.path!] || 0;
      branch.contains = convertIpfsTreeToDriveObjectTree(branch.contains, pathToCompMap, pathToSizeMap);
    }
  });
  return tree;
}

export function hasPublic(tree: DriveObject): boolean {
  return tree.contains!.some((fd) => {
    const fdTyped = fd as FileDir;
    if (fdTyped.published) return true;
    if (fd.contains && fd.contains.length) return hasPublic(fd);
    return false;
  });
}

export function inheritMetadata(path: DrivePath, pathToCompMap: Record<DrivePath, ResearchObjectV1Component>) {
  const comp = pathToCompMap[path];
  if (comp) {
    const specificMetadata = extractComponentMetadata(comp);
    if (Object.keys(specificMetadata).length) return specificMetadata;
  }

  const pathSplit = path.split('/');
  if (pathSplit.length < 3) return {};
  while (pathSplit.length > 1) {
    pathSplit.pop();
    const parentPath = pathSplit.join('/');
    const parent = pathToCompMap[parentPath];
    if (parent) {
      const potentialMetadata = extractComponentMetadata(parent);
      if (Object.keys(potentialMetadata).length) return potentialMetadata;
    }
  }
  return {};
}

export function extractComponentMetadata(component: ResearchObjectV1Component): DriveMetadata {
  if (!component) return {};
  const metadata: DriveMetadata = {};
  const validMetadataKeys: (keyof DriveMetadata)[] = [
    'title',
    'keywords',
    'description',
    'licenseType',
    'ontologyPurl',
    'cedarLink',
    'controlledVocabTerms',
  ];

  validMetadataKeys.forEach((k) => {
    if (k in component.payload) metadata[k] = component.payload[k];
  });

  return metadata;
}

export enum AccessStatus {
  PUBLIC = 'Public',
  PRIVATE = 'Private',
  PARTIAL = 'Partial',
  EXTERNAL = 'External',
  // UPLOADING = "Uploading",
  // FAILED = "Failed",
}

export function generatePathCompMap(manifest: ResearchObjectV1): Record<DrivePath, ResearchObjectV1Component> {
  const componentsMap: Record<DrivePath, ResearchObjectV1Component> = {};
  manifest.components.forEach((c) => {
    switch (c.type) {
      case ResearchObjectComponentType.CODE:
      case ResearchObjectComponentType.PDF:
      case ResearchObjectComponentType.DATA:
      case ResearchObjectComponentType.UNKNOWN:
        componentsMap[c.payload.path] = c;
        return;
      default:
        return;
    }
  });
  return componentsMap;
}
export type DriveMetadata = CommonComponentPayload & DataComponentMetadata;

export enum FileType {
  DIR = 'dir',
  FILE = 'file',
}

export enum DriveNonComponentTypes {
  MANIFEST = 'manifest',
  UNKNOWN = 'unknown',
}
export interface DriveObject {
  uid: string;
  name: string;
  lastModified: string; //date later
  componentType: ResearchObjectComponentType | DriveNonComponentTypes;
  componentSubtype?: ResearchObjectComponentSubtypes;
  componentId?: string | undefined;
  accessStatus: AccessStatus;
  size: number;
  metadata: DriveMetadata;
  cid: string;
  type: FileType;
  contains?: Array<DriveObject> | null;
  parent?: DriveObject | FileDir | null;
  path?: string;
  starred?: boolean;
  external?: boolean;
}

export function generateFlatPathDriveMap(tree: DriveObject[]): Record<DrivePath, DriveObject> {
  const contents = recursiveFlattenTree(tree);
  const map: Record<DrivePath, DriveObject> = {};
  (contents as DriveObject[]).forEach((d: DriveObject) => {
    const neutralPath = neutralizePath(d.path!);
    map[neutralPath] = d;
  });
  return map;
}

export function generatePathSizeMap(flatPathDriveMap: Record<DrivePath, DriveObject>): Record<DrivePath, number> {
  const pathSizeMap: Record<DrivePath, number> = {};
  const dirKeys: DrivePath[] = [];
  Object.entries(flatPathDriveMap).forEach(([path, drive]) => {
    if (drive.type === FileType.DIR) {
      dirKeys.push(path);
    } else {
      pathSizeMap[path] = drive.size;
    }
  });

  const dirSizeMap: Record<DrivePath, number> = {};
  dirKeys.forEach((dirPath) => {
    // eslint-disable-next-line no-array-reduce/no-reduce
    const dirSize = Object.entries(pathSizeMap).reduce((acc: number, [path, size]) => {
      if (path.startsWith(dirPath)) return acc + size;
      return acc;
    }, 0);
    dirSizeMap[dirPath] = dirSize || 0;
  });
  return { ...pathSizeMap, ...dirSizeMap };
}

interface VirtualDriveArgs {
  name: string;
  componentType?: ResearchObjectComponentType | DriveNonComponentTypes;
  componentSubtype?: ResearchObjectComponentSubtypes;
  componentId?: string;
  size?: number;
  contains?: Array<DriveObject>;
  lastModified?: string;
  accessStatus?: AccessStatus;
  metadata?: DriveMetadata;
  cid?: string;
  parent?: DriveObject | FileDir | null;
  path?: string;
  uid?: string;
  starred?: boolean;
  type?: FileType;
}
export function createVirtualDrive({
  name,
  componentType,
  componentId,
  size,
  contains,
  lastModified,
  accessStatus,
  componentSubtype,
  metadata,
  cid,
  parent,
  path,
  uid,
  starred,
  type,
}: VirtualDriveArgs): DriveObject {
  return {
    name,
    componentType: componentType || ResearchObjectComponentType.UNKNOWN,
    componentSubtype: componentSubtype || undefined,
    componentId: componentId || undefined,
    size: size || 0,
    contains: contains, // if we default to blank array External Links are treated as folders for file picker
    lastModified: lastModified || tempDate,
    accessStatus: accessStatus || AccessStatus.PRIVATE,
    metadata: metadata || {},
    cid: cid || '',
    type: type || FileType.DIR,
    parent: parent || null,
    path: path || undefined,
    uid: uid || randomUUID(),
    starred: starred || false,
  };
}
export const tempDate = '12/02/2022 7:00PM';

/*
 ** TREE FUNCS END, MOVE OUT TO MODELS
 */

export const gbToBytes = (gb: number) => gb * 1000000000;
export const bytesToGb = (bytes: number) => bytes / 1000000000;

export const ROTypesToPrismaTypes = {
  [ResearchObjectComponentType.DATA]: DataType.DATASET,
  [ResearchObjectComponentType.PDF]: DataType.DOCUMENT,
  [ResearchObjectComponentType.CODE]: DataType.CODE_REPOS,
  [ResearchObjectComponentType.VIDEO]: DataType.VIDEOS,
  [ResearchObjectComponentType.DATA_BUCKET]: DataType.DATA_BUCKET,
};

export function generateManifestPathsToDbTypeMap(manifest: ResearchObjectV1) {
  const manifestPathsToTypes: Record<string, DataType> = {};
  manifest.components.forEach((c) => {
    if (c.payload?.path) {
      const dbType: DataType = ROTypesToPrismaTypes[c.type];
      if (dbType) manifestPathsToTypes[c.payload.path] = dbType;
    }
  });
  manifestPathsToTypes[DRIVE_NODE_ROOT_PATH] = DataType.DATA_BUCKET;
  return manifestPathsToTypes;
}

export function inheritComponentType(path, pathToDbTypeMap: Record<string, DataType>) {
  const naturalType = pathToDbTypeMap[path];
  if (naturalType && naturalType !== DataType.UNKNOWN) return naturalType;
  const pathSplit = path.split('/');
  if (pathSplit.length < 3) return DataType.UNKNOWN;
  while (pathSplit.length > 1) {
    pathSplit.pop();
    const parentPath = pathSplit.join('/');
    const parent = pathToDbTypeMap[parentPath];
    if (parent && parent !== DataType.UNKNOWN) {
      return parent;
    }
  }
  return DataType.UNKNOWN;
}

/* 
Inconsistent use of URL and CID within the manifest payloads, PDFs and Code Repos use .url,
 others generally use .cid, this helper function fetches the appropriate property
  */
export function urlOrCid(cid: string, type: ResearchObjectComponentType) {
  switch (type) {
    case ResearchObjectComponentType.PDF:
    case ResearchObjectComponentType.CODE:
    case ResearchObjectComponentType.LINK:
      return { url: cid };
    case ResearchObjectComponentType.DATA:
    case ResearchObjectComponentType.DATA_BUCKET:
      return { cid };
    default:
      return { cid };
  }
}

export type DrivePath = string;
export const DRIVE_NODE_ROOT_PATH = 'root';

export function neutralizePath(path: DrivePath) {
  if (!path.includes('/') && path.length) return 'root';
  return path.replace(/^[^/]+/, DRIVE_NODE_ROOT_PATH);
}
export function deneutralizePath(path: DrivePath, rootCid: string) {
  if (!path.includes('/') && path.length) return rootCid;
  return path.replace(/^[^/]+/, rootCid);
}

export interface FirstNestingComponent {
  name: string;
  path: string;
  cid: string;
  componentType?: ResearchObjectComponentType;
  componentSubtype?: ResearchObjectComponentSubtypes;
  star?: boolean;
  externalUrl?: string;
}
export function addComponentsToManifest(manifest: ResearchObjectV1, firstNestingComponents: FirstNestingComponent[]) {
  //add duplicate path check
  firstNestingComponents.forEach((c) => {
    const comp = {
      id: randomUUID(),
      name: c.name,
      ...(c.componentType && { type: c.componentType }),
      ...(c.componentSubtype && { subtype: c.componentSubtype }),
      payload: {
        ...urlOrCid(c.cid, c.componentType),
        path: c.path,
        ...(c.externalUrl && { externalUrl: c.externalUrl }),
      },
      starred: c.star || false,
    };
    manifest.components.push(comp);
  });
  return manifest;
}

export type oldCid = string;
export type newCid = string;
export function updateManifestComponentDagCids(manifest: ResearchObjectV1, updatedDagCidMap: Record<oldCid, newCid>) {
  manifest.components.forEach((c) => {
    if (c.payload?.cid in updatedDagCidMap) c.payload.cid = updatedDagCidMap[c.payload.cid];
    if (c.payload?.url in updatedDagCidMap) c.payload.url = updatedDagCidMap[c.payload.url];
  });
  return manifest;
}

export type ExternalCidMap = Record<string, { size: number; path: string; directory: boolean }>;

export async function generateExternalCidMap(nodeUuid) {
  const externalCidMap: ExternalCidMap = {};
  const dataReferences = await prisma.dataReference.findMany({
    where: {
      node: {
        uuid: nodeUuid.endsWith('.') ? nodeUuid : nodeUuid + '.',
      },
      external: true,
    },
  });
  dataReferences.forEach((d: DataReference) => {
    externalCidMap[d.cid] = {
      size: d.size,
      path: d.path,
      directory: d.directory,
    };
  });
  return externalCidMap;
}
