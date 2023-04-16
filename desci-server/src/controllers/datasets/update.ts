import { randomUUID } from 'crypto';

import {
  ResearchObjectComponentSubtypes,
  ResearchObjectComponentType,
  ResearchObjectV1,
} from '@desci-labs/desci-models';
import { PBNode } from '@ipld/dag-pb/src/interface';
import { DataReference, DataType, PrismaPromise, User } from '@prisma/client';
import axios from 'axios';
import { Request, Response, NextFunction } from 'express';

import prisma from 'client';
import { cleanupManifestUrl } from 'controllers/nodes';
import { getAvailableDataUsageForUserBytes, hasAvailableDataUsageForUpload } from 'services/dataService';
import {
  addFilesToDag,
  FilesToAddToDag,
  getDirectoryTree,
  getExternalSize,
  getExternalSizeAndType,
  GetExternalSizeAndTypeResult,
  IpfsDirStructuredInput,
  IpfsPinnedResult,
  isDir,
  pinDirectory,
  zipToPinFormat,
} from 'services/ipfs';
import { arrayXor, processExternalUrls, zipUrlToBuffer } from 'utils';
import {
  FirstNestingComponent,
  ROTypesToPrismaTypes,
  addComponentsToManifest,
  deneutralizePath,
  gbToBytes,
  generateManifestPathsToDbTypeMap,
  getTreeAndFillSizes,
  neutralizePath,
  recursiveFlattenTree,
  updateManifestComponentDagCids,
  urlOrCid,
} from 'utils/driveUtils';

import { DataReferenceSrc } from './retrieve';
import { persistManifest } from './upload';

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

export const update = async (req: Request, res: Response) => {
  const owner = (req as any).user as User;
  const { uuid, manifest, contextPath, componentType, componentSubType } = req.body;
  let { externalUrl, externalCids } = req.body;
  //Require XOR (files, externalCid, externalUrl)
  //ExternalURL - url + type (code for now)
  //v0 ExternalCids - cids + type (data for now), no pinning
  console.log('files rcvd: ', req.files);
  console.log('[UPDATE DATASET] Updating in context: ', contextPath);
  if (uuid === undefined || manifest === undefined || contextPath === undefined)
    return res.status(400).json({ error: 'uuid, manifest, contextPath required' });
  const manifestObj: ResearchObjectV1 = JSON.parse(manifest);
  if (externalUrl) externalUrl = JSON.parse(externalUrl);
  if (externalCids) externalCids = JSON.parse(externalCids);

  let uploaded: IpfsPinnedResult[];

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
  if (!arrayXor([externalUrl, files.length, externalCids?.length]))
    return res.status(400).json({ error: 'Choose between one of the following; files, externalUrl or externalCids' });

  /*
   ** Github Code Repositories setup (and future externalURLs)
   */
  let externalUrlFiles: IpfsDirStructuredInput[];
  let externalUrlTotalSizeBytes: number;
  if (
    externalUrl &&
    externalUrl?.path?.length &&
    externalUrl?.url?.length &&
    componentType === ResearchObjectComponentType.CODE
  ) {
    const processedUrl = await processExternalUrls(externalUrl.url, componentType);
    const zipBuffer = await zipUrlToBuffer(processedUrl);
    const { files, totalSize } = await zipToPinFormat(zipBuffer, externalUrl.path);
    externalUrlFiles = files;
    externalUrlTotalSizeBytes = totalSize;
  }

  /*
   ** External CID setup
   */
  if (externalCids && externalCids.length && componentType === ResearchObjectComponentType.DATA) {
    const cidSizes: Record<string, GetExternalSizeAndTypeResult> = {};
    try {
      for (const extCid of externalCids) {
        const { isDirectory, size } = await getExternalSizeAndType(extCid.cid);
        if (size !== undefined && isDirectory !== undefined) {
          cidSizes[extCid.cid] = { size, isDirectory };
        } else {
          throw new Error(`Failed to get size and type of external CID: ${extCid}`);
        }
      }
    } catch (e: any) {
      console.error(`[UPDATE DAG] External CID Method: ${e}`);
      debugger;
      return res.status(400).json({ error: 'Failed to resolve external CID' });
    }
    debugger;
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

  const manifestPathsToTypesPrune = generateManifestPathsToDbTypeMap(latestManifestEntry);

  /*
   ** Check if user has enough storage space to upload
   */
  let uploadSizeBytes = 0;
  if (files.length) files.forEach((f) => (uploadSizeBytes += f.size));
  if (externalUrl) uploadSizeBytes += externalUrlTotalSizeBytes;
  const hasStorageSpaceToUpload = await hasAvailableDataUsageForUpload(owner, { fileSizeBytes: uploadSizeBytes });
  if (!hasStorageSpaceToUpload)
    return res.send(400).json({
      error: `upload size of ${uploadSizeBytes} exceeds users data budget of ${owner.currentDriveStorageLimitGb} GB`,
    });

  //Pull old tree
  const oldTree = await getDirectoryTree(rootCid);
  const oldFlatTree = recursiveFlattenTree(oldTree);

  /*
   ** Determine the path of the directory to be updated
   */
  const splitContextPath = contextPath.split('/');
  splitContextPath.shift();
  //cleanContextPath = how many dags need to be reset, n + 1
  const cleanContextPath = splitContextPath.join('/');
  console.log('[UPDATE DATASET] cleanContextPath: ', cleanContextPath);

  //ensure all paths are unique to prevent borking datasets, reject if fails unique check
  const OldTreePaths = oldFlatTree.map((e) => e.path);
  let newPathsFormatted: string[] = [];
  if (files.length) {
    newPathsFormatted = files.map((f) => {
      const header = !!cleanContextPath ? rootCid + '/' + cleanContextPath : rootCid;
      return header + f.originalname;
    });
  }
  if (externalUrl) {
    newPathsFormatted = externalUrlFiles.map((f) => {
      const header = !!cleanContextPath ? rootCid + '/' + cleanContextPath : rootCid;
      return header + '/' + f.path;
    });
  }

  const hasDuplicates = OldTreePaths.some((oldPath) => newPathsFormatted.includes(oldPath));
  if (hasDuplicates) {
    console.log('[UPDATE DATASET] Rejected as duplicate paths were found');
    return res.status(400).json({ error: 'Duplicate files rejected' });
  }

  //Pin the new files
  const structuredFilesForPinning: IpfsDirStructuredInput[] = files.map((f: any) => {
    return { path: f.originalname, content: f.buffer };
  });

  if (structuredFilesForPinning.length || externalUrlFiles?.length) {
    const filesToPin = structuredFilesForPinning.length ? structuredFilesForPinning : externalUrlFiles;
    // debugger;
    if (filesToPin.length) uploaded = await pinDirectory(filesToPin);
    if (!uploaded.length) res.status(400).json({ error: 'Failed uploading to ipfs' });
    console.log('[UPDATE DATASET] Pinned files: ', uploaded);
  }

  //Filtered to first nestings only
  const filteredFiles = uploaded.filter((file) => {
    return file.path.split('/').length === 1;
  });

  const filesToAddToDag: FilesToAddToDag = {};
  filteredFiles.forEach((file) => {
    filesToAddToDag[file.path] = { cid: file.cid, size: file.size };
  });

  const { updatedRootCid: newRootCidString, updatedDagCidMap } = await addFilesToDag(
    rootCid,
    cleanContextPath,
    filesToAddToDag,
  );
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

  let updatedManifest = updateManifestDataset({
    manifest: latestManifest,
    dataBucketId: dataBucketId,
    newRootCid: newRootCidString,
  });

  //Update all existing DAG components with new CIDs if they were apart of a cascading update
  if (Object.keys(updatedDagCidMap).length) {
    updatedManifest = updateManifestComponentDagCids(updatedManifest, updatedDagCidMap);
  }

  //Only needs to happen if a predefined component type is to be added
  if (componentType) {
    const firstNestingComponents: FirstNestingComponent[] = filteredFiles.map((file) => {
      const neutralFullPath = contextPath + '/' + file.path;
      const pathSplit = file.path.split('/');
      const name = pathSplit.pop();
      return {
        name: name,
        path: neutralFullPath,
        cid: file.cid,
        componentType,
        componentSubType,
        star: true,
        ...(externalUrl && { externalUrl: externalUrl.url }),
      };
    });
    updatedManifest = addComponentsToManifest(updatedManifest, firstNestingComponents);
  }

  //For adding correct types to the db, when a predefined component type is used
  const newFilePathDbTypeMap = {};
  uploaded.forEach((file) => {
    const neutralFullPath = contextPath + '/' + file.path;
    const deneutralizedFullPath = deneutralizePath(neutralFullPath, newRootCidString);
    newFilePathDbTypeMap[deneutralizedFullPath] = ROTypesToPrismaTypes[componentType] || DataType.UNKNOWN;
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
    const existingRefs = await prisma.dataReference.findMany({
      where: {
        nodeId: node.id,
        userId: owner.id,
        type: { not: DataType.MANIFEST },
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
    //Manual upsert
    const dataRefUpdates = dataRefsToUpsert
      .filter((dref) => {
        const neutralPath = dref.path.replace(newRootCidString, 'root');
        const match = existingRefs.find((ref) => neutralizePath(ref.path) === neutralPath);
        return match;
      })
      .map((dref) => {
        const neutralPath = dref.path.replace(newRootCidString, 'root');
        const match = existingRefs.find((ref) => neutralizePath(ref.path) === neutralPath);
        dref.id = match.id;
        const newFileType = newFilePathDbTypeMap[dref.path];
        dref.type =
          newFileType && newFileType !== DataType.UNKNOWN
            ? newFileType
            : manifestPathsToTypes[neutralPath] || DataType.UNKNOWN;
        return dref;
      });
    const dataRefCreates = dataRefsToUpsert
      .filter((dref) => {
        const neutralPath = dref.path.replace(newRootCidString, 'root');
        const inUpdates = dataRefUpdates.find((ref) => neutralizePath(ref.path) === neutralPath);
        return !inUpdates;
      })
      .map((dref) => {
        const neutralPath = dref.path.replace(newRootCidString, 'root');
        const newFileType = newFilePathDbTypeMap[dref.path];
        dref.type =
          newFileType && newFileType !== DataType.UNKNOWN
            ? newFileType
            : manifestPathsToTypes[neutralPath] || DataType.UNKNOWN;
        return dref;
      }) as DataReference[];

    const upserts = await prisma.$transaction([
      ...(dataRefUpdates as any).map((fd) => {
        return prisma.dataReference.update({ where: { id: fd.id }, data: fd });
      }),
      prisma.dataReference.createMany({ data: dataRefCreates }),
    ]);
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
    const { persistedManifestCid, date } = await persistManifest({ manifest: updatedManifest, node, userId: owner.id });
    if (!persistedManifestCid)
      throw Error(`Failed to persist manifest: ${updatedManifest}, node: ${node}, userId: ${owner.id}`);

    const tree = await getTreeAndFillSizes(newRootCidString, uuid, DataReferenceSrc.PRIVATE, owner.id);
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
