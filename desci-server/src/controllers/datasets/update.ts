import { ResearchObjectV1 } from '@desci-labs/desci-models';
import { PBNode } from '@ipld/dag-pb/src/interface';
import { DataType, User } from '@prisma/client';
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
import { gbToBytes, getTreeAndFillSizes, recursiveFlattenTree } from 'utils/driveUtils';

import { DataReferenceSrc } from './retrieve';
import { persistManifest } from './upload';

interface UpdatingManifestParams {
  manifest: ResearchObjectV1;
  datasetId: string;
  newRootCid: string;
}

export function updateManifestDataset({ manifest, datasetId, newRootCid }: UpdatingManifestParams) {
  const componentIndex = manifest.components.findIndex((c) => c.id === datasetId);
  manifest.components[componentIndex] = {
    ...manifest.components[componentIndex],
    payload: {
      ...manifest.components[componentIndex].payload,
      cid: newRootCid,
    },
  };

  return manifest;
} //

export const update = async (req: Request, res: Response) => {
  const owner = (req as any).user as User;
  const { uuid, manifest, rootCid, contextPath } = req.body;
  console.log('files rcvd: ', req.files);
  console.log('[UPDATE DATASET] Updating in context: ', contextPath);
  if (uuid === undefined || manifest === undefined || rootCid === undefined || contextPath === undefined)
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

  const files = req.files as Express.Multer.File[];
  if (!files) return res.status(400).json({ message: 'No files received' });

  let uploadSizeBytes = 0;
  files.forEach((f) => (uploadSizeBytes += f.size));

  const hasStorageSpaceToUpload = await hasAvailableDataUsageForUpload(owner, { fileSizeBytes: uploadSizeBytes });
  if (!hasStorageSpaceToUpload)
    return res.send(400).json({
      error: `upload size of ${uploadSizeBytes} exceeds users data budget of ${owner.currentDriveStorageLimitGb} GB`,
    });

  const dagCidsToBeReset = [];

  //                  CID(String): DAGNode     - cached to prevent duplicate calls
  const dagsLoaded: Record<string, PBNode> = {};

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

  const datasetId = manifestObj.components.find((c) => c.payload.cid === rootCid).id;

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

  const updatedManifest = updateManifestDataset({
    manifest: latestManifest,
    datasetId: datasetId,
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

    const dataRefsToUpsert = flatTree.map((f) => {
      if (typeof f.cid !== 'string') f.cid = f.cid.toString();
      return {
        cid: f.cid,
        root: f.cid === newRootCidString,
        rootCid: newRootCidString,
        path: f.path,
        type: DataType.DATASET,
        userId: owner.id,
        nodeId: node.id,
        directory: f.type === 'dir' ? true : false,
        size: f.size,
      };
    });

    const upserts = await prisma.$transaction(
      dataRefsToUpsert.map((fd) => {
        const oldPath = fd.path.replace(newRootCidString, rootCid);
        const match = dataRefIds.find((dref) => dref.path === oldPath);
        let refId = 0;
        if (match) refId = match.id;
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

    const formattedPruneList = pruneList.map((e) => {
      return {
        description: 'DANGLING DAG, UPDATED DATASET (update v2)',
        cid: e.cid,
        type: DataType.DATASET,
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
        return {
          description: '[UPDATE DATASET E:2] FILES PINNED WITH DB ENTRY FAILURE (update v2)',
          cid: e.cid,
          type: DataType.DATASET,
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
