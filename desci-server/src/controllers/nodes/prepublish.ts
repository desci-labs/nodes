import { ResearchObjectV1 } from '@desci-labs/desci-models';
import { NodeVersion } from '@prisma/client';
import { NextFunction, Response } from 'express';

import { prisma } from '../../client.js';
import { logger as parentLogger } from '../../logger.js';
import { RequestWithNode } from '../../middleware/authorisation.js';
import { updateManifestDataBucket } from '../../services/data/processing.js';
import { NodeUuid } from '../../services/manifestRepo.js';
import repoService from '../../services/repoService.js';
import { prepareDataRefsForDagSkeleton } from '../../utils/dataRefTools.js';
import { dagifyAndAddDbTreeToIpfs } from '../../utils/draftTreeUtils.js';
import { persistManifest } from '../data/utils.js';

type PrepublishResponse = PrepublishSuccessResponse | PrepublishErrorResponse;
export interface PrepublishSuccessResponse {
  ok: boolean;
  updatedManifestCid: string;
  updatedManifest: ResearchObjectV1;
  version?: NodeVersion;
  ceramicStream?: string;
}

export interface PrepublishErrorResponse {
  ok: false;
  error: string;
  status?: number;
}

/**
 * DAGifies the drafts current DB tree state, adds the structure to IPFS (No Files Pinned, Folders staged), and updates the manifest data bucket CID.
 */
export const prepublish = async (req: RequestWithNode, res: Response<PrepublishResponse>, _next: NextFunction) => {
  const owner = req.user;
  const node = req.node;
  const { uuid } = req.body;
  const logger = parentLogger.child({
    // id: req.id,
    module: 'NODE::PrepublishController',
    body: req.body,
    uuid,
    user: (req as any).user,
    ceramicStream: node.ceramicStream,
  });
  if (!uuid) {
    return res.status(400).json({ ok: false, error: 'UUID is required.' });
  }
  // debugger; ////

  try {
    // Sourced from middleware EnsureUser
    if (!owner.id || owner.id < 1) {
      throw Error('User ID mismatch');
    }

    // Sourced from middleware EnsureWriteAccess
    if (!node) {
      logger.warn({ owner, uuid }, `unauthed node user: ${owner}, node uuid provided: ${uuid}`);
      return res.status(403).json({ ok: false, error: 'Failed' });
    }

    const manifest = await repoService.getDraftManifest({
      uuid: node.uuid as NodeUuid,
      documentId: node.manifestDocumentId,
    });

    /**
     * Dagify and add DAGs to IPFS (No Files Pinned yet, just the folder structure added to IPFS (NOT PINNED!))
     */
    const nodeFileTreeDagCid = await dagifyAndAddDbTreeToIpfs(node.id);

    // Update manifest data bucket CID, and persist the manifest
    // TODO: use repo service action dispatcher method instead
    const updatedManifest = updateManifestDataBucket({ manifest, newRootCid: nodeFileTreeDagCid });
    const { persistedManifestCid, nodeVersion } = await persistManifest({
      manifest: updatedManifest,
      node,
      userId: owner.id,
    });

    // Create public data refs for the DAGs
    const pubDataRefs = await prepareDataRefsForDagSkeleton({ node, dataBucketCid: nodeFileTreeDagCid, manifest });
    // Append the version to the data refs
    const readyPubDataRefs = pubDataRefs.map((ref) => ({ ...ref, versionId: nodeVersion.id }));
    const createdPublicRefs = await prisma.publicDataReference.createMany({
      data: readyPubDataRefs,
      skipDuplicates: true,
    });

    logger.info({ nodeFileTreeDagCid }, 'publishDraftComments::Root');
    logger.info(
      `[Prepublish DAG Skeleton Refs] Created ${createdPublicRefs.count} public data refs for node ${node.id}`,
    );

    return res.status(200).send({
      ok: true,
      updatedManifestCid: persistedManifestCid,
      updatedManifest: updatedManifest,
      version: nodeVersion,
      ceramicStream: node.ceramicStream,
    });
  } catch (err) {
    logger.error({ err }, '[prepublish::prepublish] node-pre-publish-err');
    return res.status(400).send({ ok: false, error: err.message });
  }
};
