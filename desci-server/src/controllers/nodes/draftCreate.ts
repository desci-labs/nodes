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

    let hash: string | undefined;
    let uri: string | undefined;
    let nodeVersion: unknown;
    let researchObject: any;

    try {
      const manifestResult = await makeManifest({
        title,
        researchFields,
        defaultLicense: defaultLicense || '',
        ipfsNode: getNodeToUse(isGuest),
      });
      researchObject = manifestResult.researchObject;
      const ipfsResult = await addBufferToIpfs(manifestResult.manifest, '', getNodeToUse(isGuest));
      hash = ipfsResult.cid;
      uri = `${hash}`;
    } catch (ipfsErr) {
      logger.warn({ err: ipfsErr }, 'IPFS unavailable, creating node without manifest');
    }

    const node = await prisma.node.create({
      data: {
        title,
        uuid: randomUUID64(),
        manifestUrl: uri || '',
        replicationFactor: 0,
        restBody: JSON.stringify(req.body),
        ownerId: owner.id,
      },
    });

    if (researchObject) {
      try {
        const updateResult = await updateManifestAndAddToIpfs(researchObject, {
          user: owner,
          nodeId: node.id,
          ipfsNode: getNodeToUse(owner.isGuest),
        });
        nodeVersion = updateResult.nodeVersion;

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
      } catch (ipfsErr) {
        logger.warn({ err: ipfsErr }, 'IPFS manifest update failed, continuing without it');
      }
    }

    const nodeCopy = Object.assign({}, node);
    nodeCopy.uuid = nodeCopy.uuid.replace(/\.$/, '');

    let documentId: string | undefined;
    let document: unknown;

    if (researchObject) {
      try {
        const result = await repoService.initDraftDocument({ uuid: node.uuid as NodeUuid, manifest: researchObject });

        if (result && result.documentId) {
          documentId = result.documentId;
          document = result.document;
          await prisma.node.update({ where: { id: node.id }, data: { manifestDocumentId: documentId } });
          logger.info({ uuid: node.uuid, documentId }, 'Automerge document created');
        } else {
          logger.warn({ uuid: node.uuid }, 'Automerge document creation returned empty result, skipping');
        }
      } catch (repoErr) {
        logger.warn({ err: repoErr, uuid: node.uuid }, 'Automerge document creation failed (sync-server may be down), continuing without it');
      }
    }

    res.send({
      ok: true,
      hash,
      uri,
      node: nodeCopy,
      version: nodeVersion,
      documentId,
      document,
    });

    return;
  } catch (err) {
    logger.error({ err }, 'mint-err');
    res.status(400).send({ ok: false, error: err });
    return;
  }
};
