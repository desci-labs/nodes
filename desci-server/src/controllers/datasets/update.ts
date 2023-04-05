import { randomUUID } from 'crypto';

import {
  ResearchObjectComponentSubtypes,
  ResearchObjectComponentType,
  ResearchObjectV1,
} from '@desci-labs/desci-models';
import { PBNode } from '@ipld/dag-pb/src/interface';
import { DataReference, DataType, User } from '@prisma/client';
import axios from 'axios';
import { Request, Response, NextFunction } from 'express';

import prisma from 'client';
import { cleanupManifestUrl } from 'controllers/nodes';
import { getAvailableDataUsageForUserBytes, hasAvailableDataUsageForUpload } from 'services/dataService';
import {
  addFilesToDag,
  FilesToAddToDag,
  getDirectoryTree,
  IpfsDirStructuredInput,
  IpfsPinnedResult,
  isDir,
  pinDirectory,
} from 'services/ipfs';
import {
  ROTypesToPrismaTypes,
  gbToBytes,
  generateManifestPathsToDbTypeMap,
  getTreeAndFillSizes,
  recursiveFlattenTree,
  urlOrCid,
} from 'utils/driveUtils';

import { DataReferenceSrc } from './retrieve';
import { persistManifest } from './upload';
import path from 'path';

interface UpdatingManifestParams {
  manifest: ResearchObjectV1;
  dataBucketId: string;
  newRootCid: string;
}

export function updateManifestDataset({ manifest, dataBucketId, newRootCid }: UpdatingManifestParams) {
  const componentIndex = manifest.components.findIndex((c) => c.id === dataBucketId);
  manifest.components[componentIndex] = {
    ...manifest.components[componentIndex],
    payload: {
      ...manifest.components[componentIndex].payload,
      cid: newRootCid,
    },
  };

  return manifest;
} //

interface FirstNestingComponent {
  name: string;
  path: string;
  cid: string;
  componentType?: ResearchObjectComponentType;
  componentSubType?: ResearchObjectComponentSubtypes;
}
export function addComponentsToManifest(manifest: ResearchObjectV1, firstNestingComponents: FirstNestingComponent[]) {
  firstNestingComponents.forEach((c) => {
    const comp = {
      id: randomUUID(),
      name: c.name,
      ...(c.componentType && { type: c.componentType }),
      ...(c.componentSubType && { subtype: c.componentSubType }),
      payload: {
        ...urlOrCid(c.cid, c.componentType),
        path: c.path,
      },
    };
    manifest.components.push(comp);
  });
  return manifest;
}

export const update = async (req: Request, res: Response) => {
  const owner = (req as any).user as User;
  const { uuid, manifest, contextPath, componentType, componentSubType, externalCids } = req.body;
  console.log('files rcvd: ', req.files);
  console.log('[UPDATE DATASET] Updating in context: ', contextPath);
  if (uuid === undefined || manifest === undefined || contextPath === undefined)
    return res.status(400).json({ error: 'uuid, manifest, rootCid, contextPath required' });
  const manifestObj: ResearchObjectV1 = JSON.parse(manifest);

  //validate requester owns the node
  const node = await prisma.node.findFirst({
    where: {
      ownerId: owner.id,
      uuid: uuid + '.',
    },
  });
  if (!node) {
    console.log(`unauthed node user: ${owner}, node uuid provided: ${uuid}`);
    return res.status(400).json({ error: 'failed' });
  }

  //finding rootCid
  const manifestCidEntry = node.manifestUrl || node.cid;
  const manifestUrlEntry = manifestCidEntry
    ? cleanupManifestUrl(manifestCidEntry as string, req.query?.g as string)
    : null;

  const fetchedManifestEntry = manifestUrlEntry ? await (await axios.get(manifestUrlEntry)).data : null;
  const latestManifestEntry = fetchedManifestEntry || manifestObj;
  const rootCid = latestManifestEntry.components.find((c) => c.type === ResearchObjectComponentType.DATA_BUCKET).payload
    .cid; //changing the rootCid to the data bucket entry

  const files = req.files as Express.Multer.File[];
  if (!files) return res.status(400).json({ message: 'No files received' });

  const manifestPathsToTypesPrune = generateManifestPathsToDbTypeMap(latestManifestEntry);

  let uploadSizeBytes = 0;
  files.forEach((f) => (uploadSizeBytes += f.size));

  const hasStorageSpaceToUpload = await hasAvailableDataUsageForUpload(owner, { fileSizeBytes: uploadSizeBytes });
  if (!hasStorageSpaceToUpload)
    return res.send(400).json({
      error: `upload size of ${uploadSizeBytes} exceeds users data budget of ${owner.currentDriveStorageLimitGb} GB`,
    });

  //Pull old tree
  const oldTree = await getDirectoryTree(rootCid);
  const oldFlatTree = recursiveFlattenTree(oldTree);

  const splitContextPath = contextPath.split('/');
  if (splitContextPath[0] === 'Data') splitContextPath.shift();
  splitContextPath.shift();
  //cleanContextPath = how many dags need to be reset, n + 1
  const cleanContextPath = splitContextPath.join('/');
  console.log('[UPDATE DATASET] cleanContextPath: ', cleanContextPath);

  //ensure all paths are unique to prevent borking datasets, reject if fails unique check
  const OldTreePaths = oldFlatTree.map((e) => e.path);
  const newPathsFormatted = files.map((f) => {
    const header = !!cleanContextPath ? rootCid + '/' + cleanContextPath : rootCid;
    return header + f.originalname;
  });
  const hasDuplicates = OldTreePaths.some((oldPath) => newPathsFormatted.includes(oldPath));
  if (hasDuplicates) {
    console.log('[UPDATE DATASET] Rejected as duplicate paths were found');
    return res.status(400).json({ error: 'Duplicate files rejected' });
  }

  //Pin the new files
  const structuredFilesForPinning: IpfsDirStructuredInput[] = files.map((f: any) => {
    return { path: f.originalname, content: f.buffer };
  });

  const uploaded: IpfsPinnedResult[] = await pinDirectory(structuredFilesForPinning);
  if (!uploaded.length) res.status(400).json({ error: 'Failed uploading to ipfs' });
  console.log('[UPDATE DATASET] Pinned files: ', uploaded);
  const filteredFiles = uploaded.filter((file) => {
    return file.path.split('/').length === 1;
  });

  const filesToAddToDag: FilesToAddToDag = {};
  filteredFiles.forEach((file) => {
    filesToAddToDag[file.path] = { cid: file.cid, size: file.size };
  });

  const newRootCidString = await addFilesToDag(rootCid, cleanContextPath, filesToAddToDag);
  if (typeof newRootCidString !== 'string') return res.status(400).json({ error: 'DAG extension failed' });

  //repull of node required, previous manifestUrl may already be stale
  const ltsNode = await prisma.node.findFirst({
    where: {
      ownerId: owner.id,
      uuid: uuid + '.',
    },
  });

  const latestManifestCid = ltsNode.manifestUrl || ltsNode.cid;
  const manifestUrl = latestManifestCid
    ? cleanupManifestUrl(latestManifestCid as string, req.query?.g as string)
    : null;

  const fetchedManifest = manifestUrl ? await (await axios.get(manifestUrl)).data : null;
  const latestManifest = fetchedManifest || manifestObj;

  const dataBucketId = latestManifest.components.find((c) => c.type === ResearchObjectComponentType.DATA_BUCKET).id;

  const updatedManifest = updateManifestDataset({
    manifest: latestManifest,
    dataBucketId: dataBucketId,
    newRootCid: newRootCidString,
  });

  try {
    //Update refs
    const flatTree = recursiveFlattenTree(await getDirectoryTree(newRootCidString));
    flatTree.push({
      cid: newRootCidString,
      type: 'dir',
      path: newRootCidString,
      size: 0,
    });

    //existing refs
    const dataRefIds = await prisma.dataReference.findMany({
      where: {
        rootCid: rootCid,
        nodeId: node.id,
        userId: owner.id,
      },
    });

    const dataRefsToUpsert: Partial<DataReference>[] = flatTree.map((f) => {
      if (typeof f.cid !== 'string') f.cid = f.cid.toString();
      return {
        cid: f.cid,
        root: f.cid === newRootCidString,
        rootCid: newRootCidString,
        path: f.path,
        type: DataType.UNKNOWN,
        userId: owner.id,
        nodeId: node.id,
        directory: f.type === 'dir' ? true : false,
        size: f.size || 0,
      };
    });

    const manifestPathsToTypes = generateManifestPathsToDbTypeMap(updatedManifest);

    const upserts = await prisma.$transaction(
      (dataRefsToUpsert as any).map((fd) => {
        const oldPath = fd.path.replace(newRootCidString, rootCid);
        const neutralPath = fd.path.replace(newRootCidString, 'root');
        const match = dataRefIds.find((dref) => dref.path === oldPath);
        let refId = 0;
        if (match) refId = match.id;
        fd.type = manifestPathsToTypes[neutralPath] || DataType.UNKNOWN;
        return prisma.dataReference.upsert({
          where: {
            id: refId,
          },
          update: {
            ...fd,
          },
          create: {
            ...fd,
          },
        });
      }),
    );
    if (upserts) console.log(`${upserts.length} new data references added/modified`);

    // //CLEANUP DANGLING REFERENCES//
    oldFlatTree.push({ cid: rootCid, path: rootCid, name: 'Old Root Dir', type: 'dir', size: 0 });

    const newFilesPathAdjusted = flatTree.map((f) => {
      f.path = f.path.replace(newRootCidString, '', 0);
      return f;
    });

    //length should be n + 1, n being nested dirs + rootCid
    const pruneList = oldFlatTree.filter((oldF) => {
      const oldPathAdjusted = oldF.path.replace(rootCid, '', 0);
      //a path match && a CID difference = prune
      return newFilesPathAdjusted.some((newF) => oldPathAdjusted === newF.path && oldF.cid !== newF.cid);
    });
    debugger;
    const formattedPruneList = pruneList.map((e) => {
      const neutralPath = e.path.replace(rootCid, 'root');
      return {
        description: 'DANGLING DAG, UPDATED DATASET (update v2)',
        cid: e.cid,
        type: manifestPathsToTypesPrune[neutralPath] || DataType.UNKNOWN,
        size: 0, //only dags being removed in an update op
        nodeId: node.id,
        userId: owner.id,
        directory: e.type === 'dir' ? true : false,
      };
    });

    const pruneRes = await prisma.cidPruneList.createMany({ data: formattedPruneList });
    console.log(`[PRUNING] ${pruneRes.count} cidPruneList entries added.`);
    //END OF CLEAN UP//

    const tree = await getTreeAndFillSizes(newRootCidString, uuid, DataReferenceSrc.PRIVATE, owner.id);
    const { persistedManifestCid, date } = await persistManifest({ manifest: updatedManifest, node, userId: owner.id });
    if (!persistedManifestCid)
      throw Error(`Failed to persist manifest: ${updatedManifest}, node: ${node}, userId: ${owner.id}`);

    return res.status(200).json({
      rootDataCid: newRootCidString,
      manifest: updatedManifest,
      manifestCid: persistedManifestCid,
      tree: tree,
      date: date,
    });
  } catch (e: any) {
    console.log(`[UPDATE DATASET] error: ${e}`);
    if (uploaded.length) {
      console.log(`[UPDATE DATASET E:2] CRITICAL! FILES PINNED, DB ADD FAILED, FILES: ${uploaded}`);
      const formattedPruneList = uploaded.map(async (e) => {
        const pathSplit = e.path.split('/');
        pathSplit[0] = 'root';
        const neutralPath = pathSplit.join('/');
        return {
          description: '[UPDATE DATASET E:2] FILES PINNED WITH DB ENTRY FAILURE (update v2)',
          cid: e.cid,
          type: manifestPathsToTypesPrune[neutralPath] || DataType.UNKNOWN,
          size: e.size || 0,
          nodeId: node.id,
          userId: owner.id,
          directory: await isDir(e.cid),
        };
      });
      const prunedEntries = await prisma.cidPruneList.createMany({ data: await Promise.all(formattedPruneList) });
      if (prunedEntries.count) {
        console.log(`[UPDATE DATASET E:2] ${prunedEntries.count} ADDED FILES TO PRUNE LIST`);
      } else {
        console.log(`[UPDATE DATASET E:2] failed adding files to prunelist, db may be down`);
      }
    }
    return res.status(400).json({ error: 'failed #1' });
  }
};
