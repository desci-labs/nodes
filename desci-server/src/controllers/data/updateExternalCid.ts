import { ResearchObjectComponentSubtypes, ResearchObjectComponentType } from '@desci-labs/desci-models';
import { User } from '@prisma/client';
import { Response, Request } from 'express';

import { prisma } from '../../client.js';
import { logger as parentLogger } from '../../logger.js';
import { processExternalCidDataToIpfs } from '../../services/data/externalCidProcessing.js';
import { ensureUuidEndsWithDot } from '../../utils.js';

import { ErrorResponse, UpdateResponse } from './update.js';

export type ExternalCid = {
  cid: string;
  name: string;
};

export type ExternalCidPayload = {
  uuid: string;
  contextPath: string;
  externalCids: ExternalCid[];
  componentType: ResearchObjectComponentType;
  componentSubtype: ResearchObjectComponentSubtypes;
};

/**
 * Add an external UnixFS tree to the drive, without actually getting the files,
 * by fetching the leafless DAG and pinning it.
 */
export const updateExternalCid = async (
  req: Request<any, any, ExternalCidPayload>,
  res: Response<UpdateResponse | ErrorResponse>,
) => {
  const owner = (req as any).user as User;
  const { uuid, contextPath, externalCids, componentType, componentSubtype } = req.body;

  const logger = parentLogger.child({
    // id: req.id,
    module: 'DATA::UpdateExternalCidController',
    userId: owner.id,
    uuid,
    contextPath,
    componentType,
    componentSubtype,
    externalCids,
  });

  logger.trace(`[UPDATE DATASET] Updating in context: ${contextPath}`);
  if (uuid === undefined || contextPath === undefined || !Array.isArray(externalCids))
    return res.status(400).json({ error: 'uuid, manifest, contextPath required, externalCids required' });

  //validate requester owns the node
  const node = await prisma.node.findFirst({
    where: {
      ownerId: owner.id,
      uuid: ensureUuidEndsWithDot(uuid),
    },
  });

  if (!node) {
    logger.warn(`unauthed node user: ${owner}, node uuid provided: ${uuid}`);
    return res.status(400).json({ error: 'failed' });
  }

  const { ok, value } = await processExternalCidDataToIpfs({
    user: owner,
    node,
    externalCids,
    contextPath,
    componentType,
    componentSubtype,
  });

  if (ok) {
    const {
      manifest: updatedManifest,
      manifestCid: persistedManifestCid,
      tree: tree,
      date: date,
    } = value as UpdateResponse;

    return res.status(200).json({
      manifest: updatedManifest,
      manifestCid: persistedManifestCid,
      tree: tree,
      date: date,
    });
  } else {
    logger.error({ value }, 'ext-cid processing error occured');
    if (!('message' in value)) return res.status(500);
    return res.status(value.status).json({ status: value.status, error: value.message });
  }
};
