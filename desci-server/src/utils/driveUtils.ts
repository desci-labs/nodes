import { randomUUID } from 'crypto';

import {
  DriveObject,
  ResearchObjectComponentSubtypes,
  ResearchObjectComponentType,
  ResearchObjectV1,
  fillIpfsTree,
} from '@desci-labs/desci-models';
import { DataReference, DataType } from '@prisma/client';

import prisma from 'client';
import { DataReferenceSrc } from 'controllers/data';
import { getDirectoryTree, RecursiveLsResult } from 'services/ipfs';

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
export async function getTreeAndFillDeprecated(
  rootCid: string,
  nodeUuid: string,
  dataSrc: DataReferenceSrc,
  ownerId?: number,
) {
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

export async function getTreeAndFill(manifest: ResearchObjectV1, nodeUuid: string, ownerId?: number) {
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

  tree = fillCidInfo(tree, cidInfoMap);

  const treeRoot = await fillIpfsTree(manifest, tree);

  return treeRoot;
}

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
