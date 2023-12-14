import * as fs from 'fs';

import { DriveObject, FileDir, ResearchObjectV1, findAndPruneNode, isNodeRoot } from '@desci-labs/desci-models';
import { DataType } from '@prisma/client';
import archiver from 'archiver';
import axios from 'axios';
import { Request, Response, NextFunction } from 'express';
import mkdirp from 'mkdirp';
import tar from 'tar';

import { prisma } from '../../client.js';
import { logger as parentLogger } from '../../logger.js';
import redisClient, { getOrCache } from '../../redisClient.js';
import { getDatasetTar } from '../../services/ipfs.js';
import { getTreeAndFill, getTreeAndFillDeprecated } from '../../utils/driveUtils.js';
import { cleanupManifestUrl } from '../../utils/manifest.js';

import { ErrorResponse } from './update.js';
import { getLatestManifest } from './utils.js';

export enum DataReferenceSrc {
  PRIVATE = 'private',
  PUBLIC = 'public',
}

interface RetrieveResponse {
  status?: number;
  tree: DriveObject[];
  date: string;
}

export const retrieveTree = async (req: Request, res: Response<RetrieveResponse | ErrorResponse | string>) => {
  let ownerId = (req as any).user?.id;
  const manifestCid: string = req.params.manifestCid;
  const uuid: string = req.params.nodeUuid;
  const shareId: string = req.params.shareId;

  // Extract the query params
  const dataPath: string = (req.query.dataPath as string) || 'root';
  const depth: number = req.query.depth ? parseInt(req.query.depth as string) : undefined;

  if (isNaN(depth) && depth !== undefined) {
    return res.status(400).json({ error: 'Invalid depth' });
  }

  const logger = parentLogger.child({
    // id: req.id,
    module: 'DATA::RetrieveController',
    uuid: uuid,
    manifestCid,
    user: ownerId,
    shareId: shareId,
  });

  logger.trace(`retrieveTree called, manifest cid received: ${manifestCid} uuid provided: ${uuid}`);
  let node = await prisma.node.findFirst({
    where: {
      ownerId: ownerId,
      uuid: uuid.endsWith('.') ? uuid : uuid + '.',
    },
  });

  if (shareId) {
    const privateShare = await prisma.privateShare.findFirst({
      where: { shareId },
      select: { node: true, nodeUUID: true },
    });
    if (!privateShare) {
      return res.status(404).send({ error: 'Invalid shareId' });
    }
    node = privateShare.node;

    if (privateShare && node) {
      ownerId = node.ownerId;
    }

    const verifiedOwner = await prisma.user.findFirst({ where: { id: ownerId } });
    if (!verifiedOwner || (verifiedOwner.id !== ownerId && verifiedOwner.id > 0)) {
      return res.status(400).send({ error: 'Invalid node owner' });
    }
  }
  if (!ownerId) {
    return res.status(401).send({ error: 'Unauthorized user' });
  }

  if (!node) {
    return res.status(400).send({ error: 'Node not found' });
  }

  if (!manifestCid) {
    return res.status(400).json({ error: 'no manifest CID provided' });
  }
  if (!uuid) {
    return res.status(400).json({ error: 'no UUID provided' });
  }

  // TODOD: Pull data references from publishDataReferences table
  // TODO: Later expand to never require auth from publicDataRefs
  let dataSource = DataReferenceSrc.PRIVATE;
  const dataset = await prisma.dataReference.findFirst({
    where: {
      type: DataType.MANIFEST,
      userId: ownerId,
      cid: manifestCid,
      node: {
        uuid: uuid + '.',
      },
    },
  });
  const publicDataset = await prisma.publicDataReference.findFirst({
    where: {
      cid: manifestCid,
      type: DataType.MANIFEST,
      node: {
        uuid: uuid + '.',
      },
    },
  });

  if (publicDataset) dataSource = DataReferenceSrc.PUBLIC;

  if (!dataset && dataSource === DataReferenceSrc.PRIVATE) {
    logger.warn(`unauthed access user: ${ownerId}, cid provided: ${manifestCid}, nodeUuid provided: ${uuid}`);
    return res.status(400).json({ error: 'failed' });
  }

  // const depthCacheKey = `depth-${depth}-${manifestCid}-${dataPath};

  const manifest = await getLatestManifest(node.uuid, req.query?.g as string, node);
  const filledTree = (await getTreeAndFill(manifest, uuid, ownerId)) ?? [];

  let tree = findAndPruneNode(filledTree[0], dataPath, depth);
  if (tree?.type === 'file' || tree === undefined) {
    // Logic to avoid returning files, if a file is the path requested, it returns its parent
    //tree can result in undefined if the dag link was recently renamed
    const poppedDataPath = dataPath.substring(0, dataPath.lastIndexOf('/'));
    tree = findAndPruneNode(filledTree[0], poppedDataPath, depth);
  }

  return res.status(200).json({ tree: [tree], date: dataset?.updatedAt.toString() });
};

interface PubTreeResponse {
  tree: DriveObject[] | FileDir[];
  date: string;
}

export const pubTree = async (req: Request, res: Response<PubTreeResponse | ErrorResponse | string>) => {
  const owner = (req as any).user;
  const manifestCid: string = req.params.manifestCid;
  const rootCid: string = req.params.rootCid;
  const uuid: string = req.params.nodeUuid;

  // Extract the query params
  const dataPath: string = (req.query.dataPath as string) || 'root';
  const depth: number = req.query.depth ? parseInt(req.query.depth as string) : undefined;

  if (isNaN(depth) && depth !== undefined) {
    return res.status(400).json({ error: 'Invalid depth' });
  }

  const logger = parentLogger.child({
    // id: req.id,
    module: 'DATA::RetrievePubTreeController',
    uuid: uuid,
    manifestCid,
    rootCid,
    user: owner?.id,
    dataPath,
    depth,
  });
  logger.trace(`pubTree called, cid received: ${manifestCid} uuid provided: ${uuid}`);
  if (!manifestCid) return res.status(400).json({ error: 'no manifest CID provided' });
  if (!uuid) return res.status(400).json({ error: 'no UUID provided' });

  // TODO: Later expand to datasets that aren't originated locally, currently the fn will fail if we don't store a pubDataRef to the dataset
  let dataSource = DataReferenceSrc.PRIVATE;
  const publicDataset = await prisma.publicDataReference.findFirst({
    where: {
      type: DataType.MANIFEST,
      cid: manifestCid,
      node: {
        uuid: uuid + '.',
      },
    },
  });

  if (publicDataset) dataSource = DataReferenceSrc.PUBLIC;

  if (!publicDataset) {
    logger.info(
      `Databucket public data reference not found, manifest cid provided: ${manifestCid}, nodeUuid provided: ${uuid}`,
    );
    return res.status(400).json({ error: 'Failed to retrieve' });
  }

  // Try early return if depth chunk cached
  const depthCacheKey = `pubTree-depth-${depth}-${manifestCid}-${dataPath}`;
  try {
    if (redisClient.isOpen) {
      const cached = await redisClient.get(depthCacheKey);
      if (cached) {
        const tree = JSON.parse(cached);
        return res.status(200).json({ tree: tree, date: publicDataset?.updatedAt.toString() });
      }
    }
  } catch (err) {
    logger.debug({ err, depthCacheKey }, 'Failed to retrieve from cache, continuing');
  }

  const manifestUrl = cleanupManifestUrl(manifestCid as string, req.query?.g as string);

  const manifest = await (await axios.get(manifestUrl)).data;

  if (!uuid) return res.status(400).json({ error: 'Manifest not found' });

  const hasDataBucket = manifest.components.find((c) => isNodeRoot(c));

  const fetchCb = hasDataBucket
    ? async () => await getTreeAndFill(manifest, uuid, undefined, true)
    : async () => await getTreeAndFillDeprecated(rootCid, uuid, dataSource);

  const cacheKey = hasDataBucket ? `pub-filled-tree-${manifestCid}` : `deprecated-filled-tree-${rootCid}`;

  let filledTree;
  try {
    filledTree = await getOrCache(cacheKey, fetchCb as any);
    if (!filledTree) throw new Error('[pubTree] Failed to retrieve tree from cache');
  } catch (err) {
    logger.warn({ fn: 'pubTree', err }, '[pubTree] error');
    logger.info('[pubTree] Falling back on uncached tree retrieval');
    return await fetchCb();
  }

  const depthTree = await getOrCache(depthCacheKey, async () => {
    const tree = hasDataBucket ? [findAndPruneNode(filledTree[0], dataPath, depth)] : filledTree;
    if (tree[0]?.type === 'file' && hasDataBucket) {
      const poppedDataPath = dataPath.substring(0, dataPath.lastIndexOf('../../'));
      return hasDataBucket ? [findAndPruneNode(filledTree[0], poppedDataPath, depth)] : filledTree;
    } else {
      return tree;
    }
  });

  return res.status(200).json({ tree: depthTree, date: publicDataset.updatedAt.toString() });
};

export const downloadDataset = async (req: Request, res: Response, next: NextFunction) => {
  const owner = (req as any).user;
  const cid: string = req.params.cid;
  const uuid: string = req.params.nodeUuid;
  const logger = parentLogger.child({
    // id: req.id,
    module: 'DATA::RetrieveDownloadController',
    uuid: uuid,
    cid: cid,
    user: owner.id,
  });
  logger.trace(`downloadDataset called, cid received: ${cid} uuid provided: ${uuid}`);

  if (!uuid) {
    res.status(400).json({ error: 'no UUID provided' });
    return;
  }

  if (!cid) {
    res.status(400).json({ error: 'no CID provided' });
    return;
  }

  const dataset = await prisma.dataReference.findFirst({
    where: {
      userId: owner.id,
      type: { not: DataType.MANIFEST },
      cid: cid,
      node: {
        uuid: uuid + '.',
      },
    },
  });

  if (!dataset) {
    logger.warn(`unauthed access user: ${owner}, cid provided: ${cid}, nodeUuid provided: ${uuid}`);
    res.status(400).json({ error: 'failed' });
    return;
  }

  const tarPath = `temp_downloads/dataset_${cid}.tar`;
  const zipPath = `temp_downloads/dataset_${cid}.zip`;

  const contents = await getDatasetTar(cid);
  const output = fs.createWriteStream(tarPath);

  for await (const chunk of contents) {
    output.write(chunk);
  }
  output.end();

  await tarToZip(tarPath, zipPath);

  res.writeHead(200, {
    'Content-Type': 'application/zip',
    'Content-disposition': `attachment; filename=dataset_${cid}.zip`,
  });

  const basePath = process.cwd() + '../../';
  const targetPath = basePath + zipPath;
  const zipped = fs.createReadStream(targetPath);

  zipped.on('open', function () {
    zipped.pipe(res);
  });

  zipped.on('close', () => {
    const dirPath = tarPath.split('.tar')[0];
    fs.promises.rm(targetPath);
    fs.promises.rm(basePath + tarPath);
    fs.promises.rm(basePath + dirPath, { recursive: true });
  });

  zipped.on('error', (e) => {
    logger.error(e);
    res.status(500).send({ ok: false });
  });
};

async function tarToZip(tarPath: string, zipPath: string): Promise<void> {
  const dirPath = tarPath.split('.tar')[0];

  //creates the dirs to prevent permission errors
  await mkdirp(dirPath);
  parentLogger.debug({ fn: tarToZip }, `dirPath: ${dirPath}`);

  try {
    await tar.extract({
      file: tarPath,
      cwd: dirPath,
    });

    const output = fs.createWriteStream(zipPath);
    const archive = archiver('zip', { zlib: { level: 9 } });
    return new Promise((success, fail) => {
      output.on('close', () => {
        parentLogger.info({ fn: tarToZip }, `Zipped ${tarPath}, ${archive.pointer()} bytes`);
        success();
      });
      archive.on('warning', (err) => {
        if (err.code === 'ENOENT') {
          parentLogger.error({ fn: tarToZip }, `error: ${err}`);
        } else {
          throw err;
        }
      });
      archive.on('error', function (err) {
        fail(err);
        throw err;
      });

      archive.pipe(output);
      archive.directory(dirPath, false);
      archive.finalize();
    });
    // return archive;
  } catch (err) {
    parentLogger.error({ fn: tarToZip }, `error: ${err}`);
  }
}
