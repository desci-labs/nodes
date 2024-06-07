import { ResearchObjectV1, DriveObject } from '@desci-labs/desci-models';
import { Response } from 'express';

import { prisma } from '../../client.js';
import { logger as parentLogger } from '../../logger.js';
import { RequestWithNode } from '../../middleware/authorisation.js';
import { processExternalUrlDataToIpfs } from '../../services/data/externalUrlProcessing.js';
import { processNewFolder, processS3DataToIpfs } from '../../services/data/processing.js';
import { arrayXor, ensureUuidEndsWithDot } from '../../utils.js';
export interface UpdateResponse {
  status?: number;
  rootDataCid?: string;
  manifest: ResearchObjectV1;
  manifestCid: string;
  tree: DriveObject[];
  date: string;
}

export interface ErrorResponse {
  error: string;
  status?: number;
}

export const update = async (req: RequestWithNode, res: Response<UpdateResponse | ErrorResponse | string>) => {
  const owner = req.user;
  let node = req.node;
  const { uuid, manifest: draftManifest, componentType, componentSubtype, newFolderName, autoStar } = req.body;
  let { contextPath } = req.body;
  // debugger;
  if (contextPath.endsWith('/')) contextPath = contextPath.slice(0, -1);
  // temp workaround for non-file uploads
  if (!node) {
    node = await prisma.node.findFirst({
      where: {
        ownerId: owner.id,
        uuid: ensureUuidEndsWithDot(uuid),
      },
    });
  }

  let { externalUrl, externalCids } = req.body;
  //Require XOR (files, externalCid, externalUrl, newFolder)
  //ExternalURL - url + type, code (github) & external pdfs for now
  const logger = parentLogger.child({
    // id: req.id,
    module: 'DATA::UpdateController',
    userId: owner.id,
    uuid: uuid,
    manifest: draftManifest,
    contextPath: contextPath,
    componentType: componentType,
    componentSubtype,
    newFolderName,
    externalUrl,
    externalCids,
    autoStar,
    files: req.files,
  });
  logger.trace(`[UPDATE DATASET] Updating in context: ${contextPath}`);
  if (uuid === undefined || contextPath === undefined)
    return res.status(400).json({ error: 'uuid, manifest, contextPath required' });
  if (externalUrl) externalUrl = JSON.parse(externalUrl);
  if (externalCids) externalCids = JSON.parse(externalCids);
  if (externalCids && Object.entries(externalCids).length > 0)
    return res.status(400).json({ error: 'EXTERNAL CID PASSED IN, use externalCid update route instead' });

  // const files = req.files as Express.Multer.File[];
  const files = req.files as any[];
  if (!arrayXor([externalUrl, files.length, newFolderName?.length]))
    return res
      .status(400)
      .json({ error: 'Choose between one of the following; files, new folder, externalUrl or externalCids' });

  /**
   * temp short circuit for testing
   *  */

  if (files.length) {
    // regular files case
    const { ok, value } = await processS3DataToIpfs({
      files,
      user: owner,
      node,
      contextPath,
      autoStar,
    });
    if (ok) {
      const {
        rootDataCid: newRootCidString,
        manifest: updatedManifest,
        manifestCid: persistedManifestCid,
        tree: tree,
        date: date,
      } = value as UpdateResponse;
      return res.status(200).json({
        rootDataCid: newRootCidString,
        manifest: updatedManifest,
        manifestCid: persistedManifestCid,
        tree: tree,
        date: date,
      });
    } else {
      if (!('message' in value)) return res.status(500);
      logger.error({ value }, 'processing error occured');
      return res.status(value.status).json({ status: value.status, error: value.message });
    }
  } else if (externalUrl && externalUrl?.url?.length) {
    // external url case
    const { ok, value } = await processExternalUrlDataToIpfs({
      user: owner,
      node,
      externalUrl,
      contextPath,
      componentType,
      componentSubtype,
    });
    if (ok) {
      const {
        rootDataCid: newRootCidString,
        manifest: updatedManifest,
        manifestCid: persistedManifestCid,
        tree: tree,
        date: date,
      } = value as UpdateResponse;
      return res.status(200).json({
        rootDataCid: newRootCidString,
        manifest: updatedManifest,
        manifestCid: persistedManifestCid,
        tree: tree,
        date: date,
      });
    } else {
      console.log(value, 'processing error occured');
      if (!('message' in value)) return res.status(500);
      logger.error({ value }, 'processing error occured');
      return res.status(value.status).json({ status: value.status, error: value.message });
    }
  } else if (newFolderName) {
    // new folder case
    const { ok, value } = await processNewFolder({
      user: owner,
      node,
      newFolderName,
      contextPath,
    });
    if (ok) {
      const {
        rootDataCid: newRootCidString,
        manifest: updatedManifest,
        manifestCid: persistedManifestCid,
        tree: tree,
        date: date,
      } = value as UpdateResponse;
      return res.status(200).json({
        rootDataCid: newRootCidString,
        manifest: updatedManifest,
        manifestCid: persistedManifestCid,
        tree: tree,
        date: date,
      });
    } else {
      if (!('message' in value)) return res.status(500);
      logger.error({ value }, 'processing error occured');
      return res.status(value.status).json({ status: value.status, error: value.message });
    }
  }
  return res.status(400).json({ status: 400, error: 'invalid API params' });
};
