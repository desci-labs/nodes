import { Response } from 'express';

import { logger } from '../../logger.js';
import { RequestWithNode } from '../../middleware/authorisation.js';
import { NodeUuid } from '../../services/manifestRepo.js';
import repoService from '../../services/repoService.js';
// import { ResearchObjectDocument } from '../../types/documents.js';
// import { backendRepo } from '../../repo.js';

export const getNodeDocument = async function (req: RequestWithNode, response: Response) {
  try {
    logger.info({ userId: req.user.id, uuid: req.node.uuid }, '[START] GetNodeDocument');
    // response.status(403).send({ ok: false, message: 'This api is deprecated' });
    // const repo = backendRepo;

    const node = req.node;
    if (!node) {
      logger.info({ module: 'GetNodeDocument' }, 'Node not found', 'Request Params', req.params);
      response.status(400).send({ ok: false, message: `Node with uuid ${req.params.uuid} not found!` });
      return;
    }

    // const uuid = node.uuid.replace(/\.$/, '');
    // let documentId = node.manifestDocumentId;
    // let document: ResearchObjectDocument | null = null;

    const document = await repoService.getDraftDocument({ uuid: node.uuid as NodeUuid });

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
    response.status(200).send({ documentId: node.manifestDocumentId, document });
  } catch (err) {
    logger.error({ err }, 'Creating new document Error', req.body, err);

    response.status(500).send({ ok: false, message: JSON.stringify(err) });
  }
};
