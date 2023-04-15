import { ResearchObjectV1, DataComponent, ResearchObjectComponentType } from '@desci-labs/desci-models';
import { DataType, Node, User } from '@prisma/client';
import axios from 'axios';
import { Request, Response, NextFunction } from 'express';
import { v4 as uuid } from 'uuid';

import prisma from 'client';
import { cleanupManifestUrl } from 'controllers/nodes';
import { hasAvailableDataUsageForUpload } from 'services/dataService';
import {
  getDirectoryTree,
  IpfsDirStructuredInput,
  IpfsPinnedResult,
  pinDirectory,
  updateManifestAndAddToIpfs,
} from 'services/ipfs';
import { getTreeAndFillSizes, recursiveFlattenTree } from 'utils/driveUtils';

import { DataReferenceSrc } from './retrieve';

export const uploadDataset = async (req: Request, res: Response, next: NextFunction) => {
  const owner = (req as any).user as User;
  const { uuid, dataFields, manifest } = req.body;
  if (uuid === undefined || dataFields === undefined || manifest === undefined)
    return res.status(400).json({ error: 'uuid, datafields, manifest required' });
  const dataFieldsObj: UpdatingManifestParams['dataFields'] = JSON.parse(dataFields);
  if (!dataFieldsObj.title) {
    dataFieldsObj.title = `Dataset ${new Date().getTime()}`;
    // return res.status(400).json({ error: 'Dataset requires a title.' });
  }
  //Maybe add a check to see if the RO is to spec
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

  // console.log('usr: ', owner);
  let uploadSizeBytes = 0;
  files.forEach((f) => (uploadSizeBytes += f.size));

  const hasStorageSpaceToUpload = await hasAvailableDataUsageForUpload(owner, { fileSizeBytes: uploadSizeBytes });
  if (!hasStorageSpaceToUpload)
    return res.send(400).json({
      error: `upload size of ${uploadSizeBytes} exceeds users data budget of ${owner.currentDriveStorageLimitGb}GB`,
    });

  const structuredFiles: IpfsDirStructuredInput[] = files.map((f: any) => {
    return { path: f.originalname, content: f.buffer };
  });

  // const fullPaths = structuredFiles.map((f) => f.path);

  const uploaded: IpfsPinnedResult[] = await pinDirectory(structuredFiles, true);
  if (!uploaded.length) res.status(400).json({ error: 'failed uploading to ipfs' });
  const rootCid = uploaded[uploaded.length - 1].cid;

  try {
    const flatTree = recursiveFlattenTree(await getDirectoryTree(rootCid));
    flatTree.push({ cid: rootCid, type: 'dir', path: rootCid });
    const uploadedStructured = uploaded.map((f) => {
      const treeMatch = flatTree.find((fd) => f.cid === fd.cid);
      const path = treeMatch.path;
      const fdType = treeMatch.type;
      return {
        cid: f.cid,
        size: f.size,
        root: f.cid === rootCid,
        rootCid: rootCid,
        path: path,
        type: DataType.DATASET,
        userId: owner.id,
        nodeId: node.id,
        // versionId: nodeVersion.id,
        directory: fdType === 'dir' ? true : false,
      };
    });
    console.log('[UPLOADED STRUCTURE]', uploadedStructured);

    const ref = await prisma.dataReference.createMany({ data: uploadedStructured });
    if (ref) console.log(`${ref.count} data references added`);

    const tree = await getTreeAndFillSizes(rootCid, uuid, DataReferenceSrc.PRIVATE, owner.id);

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
    // debugger;
    const fetchedManifest = manifestUrl ? await (await axios.get(manifestUrl)).data : null;

    const latestManifest = fetchedManifest || manifestObj;

    const updatedManifest = addDataToManifest({ manifest: latestManifest, dataFields: dataFieldsObj, rootCid });
    const { persistedManifestCid, date, nodeVersion } = await persistManifest({
      manifest: updatedManifest,
      node,
      userId: owner.id,
    });
    if (!persistedManifestCid)
      throw Error(`Failed to persist manifest: ${updatedManifest}, node: ${node}, userId: ${owner.id}`);

    return res.status(200).json({
      rootDataCid: rootCid,
      manifest: updatedManifest,
      manifestCid: persistedManifestCid,
      tree: tree,
      date: date,
    });
  } catch (e: any) {
    console.log(e);
    //delete flow
    return res.status(400).json({ error: 'failed #1' });
  }
};

interface UpdatingManifestParams {
  manifest: ResearchObjectV1;
  rootCid: string;
  dataFields: { title: string; description?: string };
}

function addDataToManifest({ manifest, dataFields, rootCid }: UpdatingManifestParams) {
  if (manifest.components.filter((c) => c.id === rootCid).length > 0) {
    throw Error('Duplicate component');
  }

  const newDataComponent: DataComponent = {
    id: uuid(),
    name: dataFields.title,
    type: ResearchObjectComponentType.DATA,
    payload: {
      cid: rootCid,
      subMetadata: {},
      description: dataFields.description || undefined,
    },
  };
  manifest.components.push(newDataComponent);
  return manifest;
}

interface PersistManifestParams {
  manifest: ResearchObjectV1;
  node: Node;
  userId: number;
}

export async function persistManifest({ manifest, node, userId }: PersistManifestParams) {
  if (node.ownerId !== userId) {
    console.log(`User: ${userId} doesnt own node ${node.id}`);
    throw Error(`User: ${userId} doesnt own node ${node.id}`);
  }

  try {
    const {
      cid,
      ref: dataRef,
      nodeVersion,
    } = await updateManifestAndAddToIpfs(manifest, { userId: node.ownerId, nodeId: node.id });

    const updated = await prisma.node.update({
      where: {
        id: node.id,
      },
      data: {
        manifestUrl: cid,
      },
    });

    if (updated && nodeVersion && dataRef) return { persistedManifestCid: cid, date: dataRef.updatedAt, nodeVersion };
  } catch (e: any) {
    console.error(`failed persisting manifest, manifest: ${manifest}, dbnode: ${node}, userId: ${userId}, e: ${e}`);
  }
  return { persistedManifestCid: null, date: null };
}
