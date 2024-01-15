import { Response } from 'express';

import { prisma } from '../../client.js';
import { logger } from '../../logger.js';
import { RequestWithNode } from '../../middleware/authorisation.js';
import { backendRepo } from '../../repo.js';
import { ResearchObjectDocument } from '../../types/documents.js';
import { getLatestManifest } from '../data/utils.js';

export const getNodeDocument = async function (req: RequestWithNode, response: Response) {
  try {
    logger.info({ userId: req.user.id, uuid: req.node.uuid }, '[START] GetNodeDocument');
    const repo = backendRepo;

    const node = req.node;

    if (!node) {
      logger.info({ module: 'GetNodeDocument' }, 'Node not found', 'Request Params', req.params);
      response.status(400).send({ ok: false, message: `Node with uuid ${req.params.uuid} not found!` });
      return;
    }

    const uuid = node.uuid.replace(/\.$/, '');
    let documentId = node.manifestDocumentId;

    if (!documentId || documentId == '') {
      logger.info({ uuid, query: req?.query?.g, node }, 'Before GetLatestManifest');
      const manifest = await getLatestManifest(uuid, req.query?.g as string, node);
      logger.info({ uuid, manifest }, 'Node latest manifest');

      if (!manifest) {
        response.status(500).send({ ok: false, message: 'Error pulling node manifest' });
        return;
      }

      // Object.assign({}, researchObject) as ResearchObjectV1; // todo: pull latest draft manifest
      const handle = repo.create<ResearchObjectDocument>();
      logger.info({ manifest, doc: handle.documentId }, 'Create new document');
      handle.change((document) => {
        document.manifest = manifest;
        document.uuid = uuid;
        document.driveClock = Date.now().toString();
      });
      handle.docSync();
      const document = await handle.doc();
      documentId = handle.documentId;
      logger.info({ document, documentId, manifest }, 'Initialized new document with Last published manifest');
      await prisma.node.update({
        where: { id: node.id },
        data: { manifestDocumentId: handle.documentId },
      });
      const updatedNode = await prisma.node.findFirst({ where: { id: node.id } });
      logger.info({ document, updatedNode }, 'Node updated');
    }
    logger.info({ documentId }, 'End GetDocumentId');
    response.status(200).send({ documentId });
  } catch (err) {
    logger.error('Creating new document Error', req.body, err);
    console.log(err);
    response.status(500).send({ ok: false, message: JSON.stringify(err) });
  }
};
