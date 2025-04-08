// import { DocumentId } from '@automerge/automerge-repo';
import {
  ExternalLinkComponent,
  PdfComponent,
  ResearchObjectComponentLinkSubtype,
  ResearchObjectComponentType,
  ResearchObjectV1,
  isNodeRoot,
} from '@desci-labs/desci-models';
import { DataReference } from '@prisma/client';
import { Request, Response, NextFunction } from 'express';

import { prisma } from '../../client.js';
import { logger as parentLogger } from '../../logger.js';
import { hasAvailableDataUsageForUpload } from '../../services/dataService.js';
import {
  addBufferToIpfs,
  downloadFilesAndMakeManifest,
  downloadSingleFile,
  getNodeToUse,
  updateManifestAndAddToIpfs,
} from '../../services/ipfs.js';
import { NodeUuid } from '../../services/manifestRepo.js';
import { createNodeDraftBlank } from '../../services/nodeManager.js';
import repoService from '../../services/repoService.js';
import { DRIVE_NODE_ROOT_PATH, ROTypesToPrismaTypes, getDbComponentType } from '../../utils/driveUtils.js';
import { ensureUuidEndsWithDot, randomUUID64 } from '../../utils.js';
import { userAnalyticsSchema } from '../admin/analytics.js';
import { AuthenticatedRequest } from '../notifications/create.js';

export const draftCreate = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const owner = req.user;
  const { isGuest } = req.user;
  const {
    title,
    links: { pdf, code },
    researchFields,
    defaultLicense,
  } = req.body;
  const logger = parentLogger.child({
    module: 'NODE::DraftCreateController',
    userId: owner.id,
    isGuest,
    body: req.body,
    title,
    links: { pdf, code },
    researchFields,
    defaultLicense,
  });
  try {
    logger.trace('Draft Create');

    if (!owner.id || owner.id < 1) {
      throw Error('User ID mismatch');
    }

    const { manifest, researchObject, files } = await downloadFilesAndMakeManifest({
      title,
      pdf,
      code,
      researchFields,
      defaultLicense: defaultLicense || '',
    });
    const { cid: hash } = await addBufferToIpfs(manifest, '', getNodeToUse(isGuest));
    const uri = `${hash}`;
    const node = await prisma.node.create({
      data: {
        title,
        uuid: randomUUID64(),
        manifestUrl: uri,
        replicationFactor: 0,
        restBody: JSON.stringify(req.body),
        ownerId: owner.id,
      },
    });

    // const dataConsumptionBytes = await getDataUsageForUserBytes(owner);

    const uploadSizeBytes = files.map((f) => f.size).reduce((total, size) => total + size, 0);

    const hasStorageSpaceToUpload = await hasAvailableDataUsageForUpload(owner, { fileSizeBytes: uploadSizeBytes });
    if (!hasStorageSpaceToUpload) {
      res.send(400).json({
        error: `upload size of ${uploadSizeBytes} exceeds users data budget of ${owner.currentDriveStorageLimitGb}GB`,
      });
      return;
    }

    const { nodeVersion } = await updateManifestAndAddToIpfs(researchObject, {
      userId: owner.id,
      nodeId: node.id,
      ipfsNode: getNodeToUse(owner.isGuest),
    });

    const uploadedFiles: Partial<DataReference>[] = researchObject.components.map((component) => {
      const isDataBucket = isNodeRoot(component);
      const size = isDataBucket ? 0 : files.find((f) => f.cid === component.payload.url)?.size;

      const dbCompType = getDbComponentType(component);

      const cid = isDataBucket ? component.payload.cid : component.payload.url;
      return {
        cid: cid,
        size: size,
        root: isDataBucket,
        type: dbCompType,
        userId: owner.id,
        nodeId: node.id,
        directory: isDataBucket,
        path: isDataBucket ? DRIVE_NODE_ROOT_PATH : DRIVE_NODE_ROOT_PATH + '/' + component.name,
        // versionId: nodeVersion.id,
      };
    });

    if (uploadedFiles.length > 0) {
      const ref = await prisma.dataReference.createMany({ data: [...uploadedFiles] as DataReference[] });
      if (ref) logger.info(`${ref.count} data references added`);
    }

    const nodeCopy = Object.assign({}, node);
    nodeCopy.uuid = nodeCopy.uuid.replace(/\.$/, '');

    const result = await repoService.initDraftDocument({ uuid: node.uuid as NodeUuid, manifest: researchObject });

    if (!result) {
      logger.error({ researchObject, uuid: node.uuid }, 'Automerge document Creation Error');
      res.status(400).send({ ok: false, message: 'Could not intialize new draft document' });
      return;
    }

    const documentId = result.documentId;
    const document = result.document;

    // attach automerge documentId to node
    await prisma.node.update({ where: { id: node.id }, data: { manifestDocumentId: documentId } });

    logger.info({ uuid: node.uuid, documentId }, 'Automerge document created');

    res.send({
      ok: true,
      hash,
      uri,
      node: nodeCopy,
      version: nodeVersion,
      documentId,
      document,
    });

    // cache initial doc for a minute (60)
    // ! disabling, as it breaks programmatic interaction from nodes-lib, where stale results break interactivity
    // await setToCache(`node-draft-${ensureUuidEndsWithDot(node.uuid)}`, { document, documentId }, 60);

    return;
  } catch (err) {
    logger.error({ err }, 'mint-err');
    res.status(400).send({ ok: false, error: err });
    return;
  }
};
