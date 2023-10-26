import {
  DEFAULT_COMPONENT_TYPE,
  ExternalLinkComponent,
  PdfComponent,
  ResearchObjectComponentLinkSubtype,
  ResearchObjectComponentType,
  ResearchObjectV1,
  isResearchObjectComponentTypeMap,
} from '@desci-labs/desci-models';
import { DataReference, DataType } from '@prisma/client';
import { Request, Response, NextFunction } from 'express';

import prisma from 'client';
import parentLogger from 'logger';
import { getDataUsageForUserBytes, hasAvailableDataUsageForUpload } from 'services/dataService';
import {
  addBufferToIpfs,
  downloadFilesAndMakeManifest,
  downloadSingleFile,
  updateManifestAndAddToIpfs,
} from 'services/ipfs';
import { createNodeDraftBlank } from 'services/nodeManager';
import { randomUUID64 } from 'utils';
import { DRIVE_NODE_ROOT_PATH, ROTypesToPrismaTypes } from 'utils/driveUtils';

const componentTypeToDataType = (type: ResearchObjectComponentType): DataType => {
  switch (type) {
    case ResearchObjectComponentType.CODE:
      return 'CODE_REPOS';
    case ResearchObjectComponentType.DATA:
      return 'DATASET';
    case ResearchObjectComponentType.PDF:
      return 'DOCUMENT';
    case ResearchObjectComponentType.VIDEO:
      return 'VIDEOS';
    case ResearchObjectComponentType.DATA_BUCKET:
      return 'DATA_BUCKET';
    default:
      throw Error('Unknown component type');
  }
};

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

    const dataConsumptionBytes = await getDataUsageForUserBytes(owner);

    // eslint-disable-next-line no-array-reduce/no-reduce
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
      const isDataBucket = component.type === ResearchObjectComponentType.DATA_BUCKET;
      const size = isDataBucket ? 0 : files.find((f) => f.cid === component.payload.url)?.size;

      const cType = isResearchObjectComponentTypeMap(component.type) ? DEFAULT_COMPONENT_TYPE : component.type;
      const dbCompType = ROTypesToPrismaTypes[cType];

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
        uuid: uuid + '.',
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
            type: componentTypeToDataType(component.type),
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
