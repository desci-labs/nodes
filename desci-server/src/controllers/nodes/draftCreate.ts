import { isNodeRoot } from '@desci-labs/desci-models';
import { DataReference, GuestDataReference } from '@prisma/client';
import { Response, NextFunction } from 'express';

import { prisma } from '../../client.js';
import { AuthenticatedRequest } from '../../core/types.js';
import { logger as parentLogger } from '../../logger.js';
import { addBufferToIpfs, makeManifest, getNodeToUse, updateManifestAndAddToIpfs } from '../../services/ipfs.js';
import { NodeUuid } from '../../services/manifestRepo.js';
import repoService from '../../services/repoService.js';
import { transformDataRefsToGuestDataRefs } from '../../utils/dataRefTools.js';
import { DRIVE_NODE_ROOT_PATH, getDbComponentType } from '../../utils/driveUtils.js';
import { randomUUID64 } from '../../utils.js';

export const draftCreate = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const owner = req.user;
  const { isGuest } = req.user;
  const { title, researchFields, defaultLicense } = req.body;
  const logger = parentLogger.child({
    module: 'NODE::DraftCreateController',
    userId: owner.id,
    isGuest,
    body: req.body,
    title,
    researchFields,
    defaultLicense,
  });
  try {
    logger.trace('Draft Create');
    if (!owner.id || owner.id < 1) {
      throw Error('User ID mismatch');
    }

    // PHASE 1: Quick initial creation with minimal operations
    const { manifest, researchObject } = await makeManifest({
      title,
      researchFields,
      defaultLicense: defaultLicense || '',
      ipfsNode: getNodeToUse(isGuest),
    });

    // Create node record immediately with temporary manifest URL
    const nodeUuid = randomUUID64();
    const node = await prisma.node.create({
      data: {
        title,
        uuid: nodeUuid,
        manifestUrl: 'pending', // Will be updated by background job
        replicationFactor: 0,
        restBody: JSON.stringify(req.body),
        ownerId: owner.id,
      },
    });

    // Return immediately with minimal data for fast response
    const nodeCopy = Object.assign({}, node);
    nodeCopy.uuid = nodeCopy.uuid.replace(/\.$/, '');

    // Send fast response to client
    res.send({
      ok: true,
      hash: 'pending', // Will be updated by background job
      uri: 'pending',
      node: nodeCopy,
      version: 1,
      documentId: 'pending', // Will be updated by background job
      document: researchObject, // Send basic manifest for immediate use
    });

    // PHASE 2: Background heavy operations (async, don't await)
    setImmediate(async () => {
      try {
        logger.trace('Starting background node initialization');

        // Upload manifest to IPFS
        const { cid: hash } = await addBufferToIpfs(manifest, '', getNodeToUse(isGuest));
        const uri = `${hash}`;

        // Update node with real manifest URL
        await prisma.node.update({
          where: { id: node.id },
          data: { manifestUrl: uri },
        });

        // Update manifest and add to IPFS
        const { nodeVersion } = await updateManifestAndAddToIpfs(researchObject, {
          user: owner,
          nodeId: node.id,
          ipfsNode: getNodeToUse(owner.isGuest),
        });

        // Create data references
        const uploadedFiles: Partial<DataReference>[] = researchObject.components.map((component) => {
          const isDataBucket = isNodeRoot(component);
          const dbCompType = getDbComponentType(component);
          const cid = isDataBucket ? component.payload.cid : component.payload.url;
          return {
            cid: cid,
            size: 0,
            root: isDataBucket,
            type: dbCompType,
            userId: owner.id,
            nodeId: node.id,
            directory: isDataBucket,
            path: isDataBucket ? DRIVE_NODE_ROOT_PATH : DRIVE_NODE_ROOT_PATH + '/' + component.name,
          };
        });

        if (uploadedFiles.length > 0) {
          const ref = owner.isGuest
            ? await prisma.guestDataReference.createMany({ data: transformDataRefsToGuestDataRefs([...uploadedFiles]) })
            : await prisma.dataReference.createMany({ data: [...uploadedFiles] as DataReference[] });
          if (ref) logger.info({ isGuest: owner.isGuest }, `${ref.count} data references added`);
        }

        // Initialize automerge document
        const result = await repoService.initDraftDocument({ uuid: node.uuid as NodeUuid, manifest: researchObject });

        if (result) {
          const documentId = result.documentId;
          // Update node with document ID
          await prisma.node.update({ where: { id: node.id }, data: { manifestDocumentId: documentId } });
          logger.info({ uuid: node.uuid, documentId }, 'Background automerge document created');
        } else {
          logger.error({ researchObject, uuid: node.uuid }, 'Background automerge document creation failed');
        }

        logger.info({ uuid: node.uuid }, 'Background node initialization completed');
      } catch (bgError) {
        logger.error({ err: bgError, uuid: node.uuid }, 'Background node initialization error');
        // Mark node as having initialization error (optional)
        // await prisma.node.update({ where: { id: node.id }, data: { status: 'initialization_failed' } });
      }
    });

    return;
  } catch (err) {
    logger.error({ err }, 'mint-err');
    res.status(400).send({ ok: false, error: err });
    return;
  }
};
