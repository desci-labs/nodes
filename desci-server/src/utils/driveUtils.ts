import { ResearchObjectComponentType, ResearchObjectV1 } from '@desci-labs/desci-models';
import { DataType } from '@prisma/client';

import prisma from 'client';
import { DataReferenceSrc } from 'controllers/datasets';
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

export const recursiveFlattenTree = (tree: RecursiveLsResult[]) => {
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
      fd.size = cidInfoMap[fd.cid].size || 0;
      fd.contains = fillDirSizes(fd.contains, cidInfoMap);
    }
    // debugger
    fd.date = cidInfoMap[fd.cid].date || Date.now();
    fd.published = cidInfoMap[fd.cid].published;
    contains.push(fd);
  });
  return contains;
}

interface CidEntryDetails {
  size?: number;
  published?: boolean;
  date?: string;
}

export async function getTreeAndFillSizes(
  rootCid: string,
  nodeUuid: string,
  dataSrc: DataReferenceSrc,
  ownerId?: number,
) {
  // debugger
  //NOTE/TODO: Adapted for priv(owner) and public (unauthed), may not work for node sharing users(authed/contributors)
  const tree: RecursiveLsResult[] = await getDirectoryTree(rootCid);

  // const dirCids = recursiveFlattenTreeFilterDirs(tree).map((dir) => dir.cid);
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

  //Necessary to determine if any private entries are already published
  // debugger
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
        date: d.createdAt.toString(),
      };
      cidInfoMap[d.cid] = entryDetails;
    });
  }

  const filledTree = fillDirSizes(tree, cidInfoMap);

  return filledTree;
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
  return manifestPathsToTypes;
}
