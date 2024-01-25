import { Response } from 'express';

import { prisma } from '../../client.js';
import { logger } from '../../logger.js';
import { RequestWithNode } from '../../middleware/authorisation.js';
import { NodeUuid } from '../../services/manifestRepo.js';
import repoService from '../../services/repoService.js';
import { getLatestManifest } from '../data/utils.js';
// import { ResearchObjectDocument } from '../../types/documents.js';
// import { backendRepo } from '../../repo.js';

export const getNodeDocument = async function (req: RequestWithNode, response: Response) {
  try {
    logger.info({ userId: req.user.id, uuid: req.node.uuid }, '[START] GetNodeDocument');
    // response.status(403).send({ ok: false, message: 'This api is deprecated' });
    // const repo = backendRepo;

    const node = req.node;

    const manifest = await getLatestManifest(node.uuid, req.query?.g as string, node);

    if (!node.manifestDocumentId) {
      const result = await repoService.initDraftDocument({ uuid: node.uuid, manifest });

      if (!result) {
        logger.error({ result, uuid: node.uuid }, 'Automerge document Creation Error');
        response.status(400).send({ ok: false, message: 'Could not intialize new draft document' });
        return;
      }

      await prisma.node.update({ where: { id: node.id }, data: { manifestDocumentId: result.documentId } });

      response.status(200).send({ documentId: result.document, document: result.document });
    } else {
      const document = await repoService.getDraftDocument({ uuid: node.uuid as NodeUuid });
      response.status(200).send({ documentId: node.manifestDocumentId, document });
    }
    // if (!documentId || documentId == '') {
    //   logger.info({ uuid, query: req?.query?.g, node }, 'Before GetLatestManifest');
    //   const manifest = await getLatestManifest(uuid, req.query?.g as string, node);
    //   logger.info({ uuid, manifest }, 'Node latest manifest');

    //   if (!manifest) {
    //     response.status(500).send({ ok: false, message: 'Error pulling node manifest' });
    //     return;
    //   }

    //   // Object.assign({}, researchObject) as ResearchObjectV1; // todo: pull latest draft manifest
    //   const handle = repo.create<ResearchObjectDocument>();
    //   logger.info({ manifest, doc: handle.documentId }, 'Create new document');
    //   handle.change(
    //     (document) => {
    //       document.manifest = manifest;
    //       document.uuid = uuid;
    //       document.driveClock = Date.now().toString();
    //     },
    //     { message: 'Init Document', time: Date.now() },
    //   );

    //   document = await handle.doc();
    //   documentId = handle.documentId;

    //   logger.info({ document, documentId, manifest }, 'Initialized new document with Last published manifest');

    //   await prisma.node.update({
    //     where: { id: node.id },
    //     data: { manifestDocumentId: handle.documentId },
    //   });
    //   const updatedNode = await prisma.node.findFirst({ where: { id: node.id } });
    //   logger.info({ document, updatedNode }, 'Node updated');
    // } else {
    //   const handle = repo.find<ResearchObjectDocument>(documentId as AnyDocumentId);
    //   document = await handle.doc();
    //   if (document.uuid !== uuid && handle.isReady()) {
    //     handle.change(
    //       (document) => {
    //         document.uuid = uuid;
    //       },
    //       { message: 'Update Document', time: Date.now() },
    //     );
    //   }
    //   document = await handle.doc();
    // }
    // logger.info({ documentId, document }, 'End GetDocumentId');
  } catch (err) {
    logger.error({ err }, 'Creating new document Error', req.body, err);

    response.status(500).send({ ok: false, message: JSON.stringify(err) });
  }
};
