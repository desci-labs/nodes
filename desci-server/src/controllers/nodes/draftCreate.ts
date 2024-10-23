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
import { setToCache } from '../../redisClient.js';
import { hasAvailableDataUsageForUpload } from '../../services/dataService.js';
import {
  addBufferToIpfs,
  downloadFilesAndMakeManifest,
  downloadSingleFile,
  updateManifestAndAddToIpfs,
} from '../../services/ipfs.js';
import { NodeUuid } from '../../services/manifestRepo.js';
import { createNodeDraftBlank } from '../../services/nodeManager.js';
import repoService from '../../services/repoService.js';
import { DRIVE_NODE_ROOT_PATH, ROTypesToPrismaTypes, getDbComponentType } from '../../utils/driveUtils.js';
import { ensureUuidEndsWithDot, randomUUID64 } from '../../utils.js';

export const draftCreate = async (req: Request, res: Response, next: NextFunction) => {
  const {
    title,
    links: { pdf, code },
    researchFields,
    defaultLicense,
  } = req.body;
  const logger = parentLogger.child({
    // id: req.id,
    module: 'NODE::DraftCreateController',
    body: req.body,
    title,
    links: { pdf, code },
    researchFields,
    defaultLicense,
  });
  logger.trace('MINT');

  try {
    const loggedInUserEmail = (req as any).user.email;

    const owner = await prisma.user.findFirst({
      where: {
        email: loggedInUserEmail,
      },
    });

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
    const { cid: hash } = await addBufferToIpfs(manifest, '');
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

    const { nodeVersion } = await updateManifestAndAddToIpfs(researchObject, { userId: owner.id, nodeId: node.id });

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

export const draftAddComponent = async (req: Request, res: Response, next: NextFunction) => {
  const { uuid: bodyUuid, componentUrl, title, componentType, componentSubtype, manifest } = req.body;
  let uuid = bodyUuid;
  const logger = parentLogger.child({
    // id: req.id,
    module: 'NODE::draftAddComponentController',
    body: req.body,
    title,
    uuid,
    componentUrl,
    componentType,
    componentSubtype,
    manifest,
    user: (req as any).user,
  });
  logger.trace('addComponentToDraft', req.body.manifest);

  try {
    const loggedInUserEmail = (req as any).user.email;

    const loggedIn = await prisma.user.findFirst({
      where: {
        email: loggedInUserEmail,
      },
    });

    const loggedInUser = loggedIn.id;

    if (!loggedInUser || loggedInUser < 1) {
      throw Error('User ID mismatch');
    }

    if (!uuid) {
      // res.status(400).send({ err: 'uuid required' });
      // return;
      logger.info({ manifest }, 'creating node upon adding component');
      const nodeTitle = (manifest as ResearchObjectV1).title;
      const nodeLicense = (manifest as ResearchObjectV1).defaultLicense;
      const researchFields = (manifest as ResearchObjectV1).researchFields;
      const nodeCopy = await createNodeDraftBlank(loggedIn, nodeTitle, nodeLicense, researchFields);
      uuid = nodeCopy.uuid;
    }

    const node = await prisma.node.findFirst({
      where: {
        ownerId: loggedInUser,
        uuid: ensureUuidEndsWithDot(uuid),
      },
    });

    const manifestParsed: ResearchObjectV1 = req.body.manifest as ResearchObjectV1;
    let dataRefCallback: (id: number) => void | null = null;
    if (
      componentType == ResearchObjectComponentType.CODE ||
      componentType == ResearchObjectComponentType.PDF ||
      componentType == ResearchObjectComponentType.DATA
    ) {
      const { component, file } = await downloadSingleFile(componentUrl);

      if (manifestParsed.components.filter((c) => c.id === component.id).length > 0) {
        throw Error('Duplicate component');
      }

      const hasStorageSpaceToUpload = await hasAvailableDataUsageForUpload(loggedIn, { fileSizeBytes: file.size });
      if (!hasStorageSpaceToUpload) {
        res.send(400).json({
          error: `upload size of ${file.size} exceeds users data budget of ${loggedIn.currentDriveStorageLimitGb} GB`,
        });
        return;
      }

      component.name = title;
      if (componentType == ResearchObjectComponentType.PDF && componentSubtype) {
        (component as PdfComponent).subtype = componentSubtype;
      }
      manifestParsed.components.push(component);

      dataRefCallback = async (versionId: number) => {
        await prisma.dataReference.create({
          data: {
            cid: file.cid,
            size: file.size,
            root: false,
            type: ROTypesToPrismaTypes[component.type],
            userId: loggedIn.id,
            nodeId: node.id,
            directory: false,
            // versionId: versionId,
          },
        });
      };
    } else if (componentType == ResearchObjectComponentType.LINK) {
      let name = 'Link';
      switch (componentSubtype as ResearchObjectComponentLinkSubtype) {
        case ResearchObjectComponentLinkSubtype.COMMUNITY_DISCUSSION:
          name = 'Link - Community Discussion';
          break;
        case ResearchObjectComponentLinkSubtype.EXTERNAL_API:
          name = 'External API';
          break;
        case ResearchObjectComponentLinkSubtype.PRESENTATION_DECK:
          name = 'External Presentation';
          break;
        case ResearchObjectComponentLinkSubtype.RESTRICTED_DATA:
          name = 'Restricted Data';
          break;
        case ResearchObjectComponentLinkSubtype.VIDEO_RESOURCE:
          name = 'Video Link';
          break;
      }
      const linkComponent: ExternalLinkComponent = {
        id: componentUrl,
        name,
        type: ResearchObjectComponentType.LINK,
        subtype: componentSubtype,
        payload: {
          url: componentUrl,
          path: DRIVE_NODE_ROOT_PATH + `/${name}`,
        },
      };
      manifestParsed.components.push(linkComponent);
    }
    const { cid: hash, nodeVersion } = await updateManifestAndAddToIpfs(manifestParsed, {
      userId: loggedInUser,
      nodeId: node.id,
    });
    const uri = `${hash}`;

    await prisma.node.update({
      where: {
        id: node.id,
      },
      data: {
        manifestUrl: uri,
        title: (manifest as ResearchObjectV1).title,
      },
    });

    dataRefCallback && (await dataRefCallback(nodeVersion.id));

    const nodeCopy = Object.assign({}, node);
    nodeCopy.uuid = nodeCopy.uuid.replace(/\.$/, '');

    res.send({
      ok: true,
      hash,
      uri,
      node: nodeCopy,
      version: nodeVersion,
    });
    return;
  } catch (err) {
    logger.error({ err }, 'mint-err');
    res.status(400).send({ ok: false, error: err.message });
    return;
  }
};
