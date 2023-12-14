import { ResearchObjectV1 } from '@desci-labs/desci-models';
import { NodeVersion } from '@prisma/client';
import { Response } from 'express';

import prisma from 'client';
import { persistManifest } from 'controllers/data/utils';
import parentLogger from 'logger';
import { AuthedRequest } from 'middleware/ensureWriteAccess';
import { getManifestFromNode, updateManifestDataBucket } from 'services/data/processing';
import { prepareDataRefsForDagSkeleton } from 'utils/dataRefTools';
import { dagifyAndAddDbTreeToIpfs } from 'utils/draftTreeUtils';

type PrepublishResponse = PrepublishSuccessResponse | PrepublishErrorResponse;
export interface PrepublishSuccessResponse {
  ok: boolean;
  updatedManifestCid: string;
  updatedManifest: ResearchObjectV1;
  version?: NodeVersion;
}

export interface PrepublishErrorResponse {
  ok: false;
  error: string;
  status?: number;
}

/**
 * DAGifies the drafts current DB tree state, adds the structure to IPFS (No Files Pinned, Folders staged), and updates the manifest data bucket CID.
 */
export const prepublish = async (req: AuthedRequest, res: Response<PrepublishResponse>) => {
  const owner = req.user;
  const node = req.node;
  const { uuid } = req.body;
  const logger = parentLogger.child({
    // id: req.id,
    module: 'NODE::PrepublishController',
    body: req.body,
    uuid,
    user: (req as any).user,
  });
  if (!uuid) {
    return res.status(400).json({ ok: false, error: 'UUID is required.' });
  }

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

    const { manifest, manifestCid } = await getManifestFromNode(node);

    /**
     * Dagify and add DAGs to IPFS (No Files Pinned yet, just the folder structure added to IPFS (NOT PINNED!))
     */
    const nodeFileTreeDagCid = await dagifyAndAddDbTreeToIpfs(node.id);

    // Update manifest data bucket CID, and persist the manifest
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

    logger.info(
      `[Prepublish DAG Skeleton Refs] Created ${createdPublicRefs.count} public data refs for node ${node.id}`,
    );

    return res.status(200).send({
      ok: true,
      updatedManifestCid: persistedManifestCid,
      updatedManifest: updatedManifest,
      version: nodeVersion,
    });
  } catch (err) {
    logger.error({ err }, '[prepublish::prepublish] node-pre-publish-err');
    return res.status(400).send({ ok: false, error: err.message });
  }
};