import * as fs from 'fs';

import { DataType } from '@prisma/client';
import archiver from 'archiver';
import { Request, Response, NextFunction } from 'express';
import mkdirp from 'mkdirp';
import tar from 'tar';

import prisma from 'client';
import parentLogger from 'logger';
import { getDatasetTar } from 'services/ipfs';
import { getTreeAndFill } from 'utils/driveUtils';

export enum DataReferenceSrc {
  PRIVATE = 'private',
  PUBLIC = 'public',
}

export const retrieveTree = async (req: Request, res: Response, next: NextFunction) => {
  let ownerId = (req as any).user?.id;
  const cid: string = req.params.cid;
  const uuid: string = req.params.nodeUuid;
  const shareId: string = req.params.shareId;
  const logger = parentLogger.child({
    // id: req.id,
    module: 'DATA::RetrieveController',
    uuid: uuid,
    cid: cid,
    user: ownerId,
    shareId: shareId,
  });

  logger.trace(`retrieveTree called, cid received: ${cid} uuid provided: ${uuid}`);

  if (shareId) {
    const privateShare = await prisma.privateShare.findFirst({
      where: { shareId },
      select: { node: true, nodeUUID: true },
    });
    if (!privateShare) {
      res.status(404).send({ ok: false, message: 'Invalid shareId' });
      return;
    }
    const node = privateShare.node;

    if (privateShare && node) {
      ownerId = node.ownerId;
    }

    const verifiedOwner = await prisma.user.findFirst({ where: { id: ownerId } });
    if (!verifiedOwner || (verifiedOwner.id !== ownerId && verifiedOwner.id > 0)) {
      res.status(400).send({ ok: false, message: 'Invalid node owner' });
      return;
    }
  }
  if (!ownerId) {
    res.status(401).send({ ok: false, message: 'Unauthorized user' });
    return;
  }

  if (!cid) {
    res.status(400).json({ error: 'no CID provided' });
    return;
  }
  if (!uuid) {
    res.status(400).json({ error: 'no UUID provided' });
    return;
  }

  // TODOD: Pull data references from publishDataReferences table
  // TODO: Later expand to never require auth from publicDataRefs
  let dataSource = DataReferenceSrc.PRIVATE;
  const dataset = await prisma.dataReference.findFirst({
    where: {
      type: { not: DataType.MANIFEST },
      userId: ownerId,
      cid: cid,
      node: {
        uuid: uuid + '.',
      },
    },
  });
  const publicDataset = await prisma.publicDataReference.findFirst({
    where: {
      cid: cid,
      type: { not: DataType.MANIFEST },
      node: {
        uuid: uuid + '.',
      },
    },
  });

  if (publicDataset) dataSource = DataReferenceSrc.PUBLIC;

  if (!dataset && dataSource === DataReferenceSrc.PRIVATE) {
    logger.warn(`unauthed access user: ${ownerId}, cid provided: ${cid}, nodeUuid provided: ${uuid}`);
    res.status(400).json({ error: 'failed' });
    return;
  }

  const filledTree = await getTreeAndFill(cid, uuid, dataSource, ownerId);

  res.status(200).json({ tree: filledTree, date: dataset?.updatedAt });
};

export const pubTree = async (req: Request, res: Response, next: NextFunction) => {
  const owner = (req as any).user;
  const cid: string = req.params.cid;
  const uuid: string = req.params.nodeUuid;
  const logger = parentLogger.child({
    // id: req.id,
    module: 'DATA::RetrievePubTreeController',
    uuid: uuid,
    cid: cid,
    user: owner.id,
  });
  logger.trace(`pubTree called, cid received: ${cid} uuid provided: ${uuid}`);
  if (!cid) return res.status(400).json({ error: 'no CID provided' });
  if (!uuid) return res.status(400).json({ error: 'no UUID provided' });

  // TODO: Later expand to datasets that aren't originated locally, currently the fn will fail if we don't store a pubDataRef to the dataset
  let dataSource = DataReferenceSrc.PRIVATE;
  const publicDataset = await prisma.publicDataReference.findFirst({
    where: {
      type: { not: DataType.MANIFEST },
      cid: cid,
      node: {
        uuid: uuid + '.',
      },
    },
  });

  if (publicDataset) dataSource = DataReferenceSrc.PUBLIC;

  if (!publicDataset) {
    logger.info(`Databucket public data reference not found, cid provided: ${cid}, nodeUuid provided: ${uuid}`);
    return res.status(400).json({ error: 'Failed to retrieve' });
  }

  const filledTree = await getTreeAndFill(cid, uuid, dataSource);

  return res.status(200).json({ tree: filledTree, date: publicDataset.updatedAt });
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

  const basePath = process.cwd() + '/';
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
