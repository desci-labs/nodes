import { Request, Response } from 'express';
import { ResearchObjectDocument } from '../../types.js';
import { prisma } from '../../client.js';
import { getLatestManifest } from './utils.js';
import { logger } from '../../logger.js';
import { AnyDocumentId, AutomergeUrl } from '@automerge/automerge-repo';
import { RequestWithNode } from '../../middleware/guard.js';
import { backendRepo } from '../../repo.js';

const getNodeDocument = async function (req: RequestWithNode, res: Response) {
  try {
    console.log('[START GetNodeDocument]', req.user.id, req.node.uuid);

    const node = req.node;

    if (!node) {
      logger.info({ module: 'GetNodeDocument' }, 'Node not found', 'Request Params', req.params);
      res.status(400).send({ ok: false, message: `Node with uuid ${req.params.uuid} not found!` });
      return;
    }

    const uuid = node.uuid;
    let documentId = node.manifestDocumentId;
    let document: ResearchObjectDocument | null = null;

    if (!documentId || documentId == '') {
      logger.info({ uuid, query: req?.query?.g, node }, 'Before GetLatestManifest');
      const manifest = await getLatestManifest(uuid, req.query?.g as string, node);
      logger.info({ uuid, manifest }, 'Node latest manifest');

      if (!manifest) {
        res.status(500).send({ ok: false, message: 'Error pulling node manifest' });
        return;
      }

      // Object.assign({}, researchObject) as ResearchObjectV1; // todo: pull latest draft manifest
      const handle = backendRepo.create<ResearchObjectDocument>();
      logger.info({ manifest, doc: handle.documentId }, 'Create new document');
      handle.change((document) => {
        document.manifest = manifest;
        document.uuid = uuid.slice(0, -1);
      });

      document = await handle.doc();
      documentId = handle.documentId;
      logger.info('Initialized new document with Last published manfiest', { manifest });

      await prisma.node.update({
        where: { id: node.id },
        data: { manifestDocumentId: handle.documentId },
      });

      const updatedNode = await prisma.node.findFirst({ where: { id: node.id } });
      logger.info({ document, updatedNode }, 'Node updated');
    } else {
      const handle = backendRepo.find<ResearchObjectDocument>(documentId as AnyDocumentId);
      document = await handle.doc();
      if (document.uuid !== uuid && handle.isReady()) {
        handle.change(
          (document) => {
            document.uuid = uuid;
          },
          { message: 'Update Document', time: Date.now() },
        );
      }
      document = await handle.doc();
    }
    logger.info({ documentId }, 'End GetDocumentId');
    res.status(200).send({ documentId, document });
  } catch (err) {
    logger.error('Creating new document Error', req.body, err);
    console.log(err);
    res.status(500).send({ ok: false, message: JSON.stringify(err) });
  }
};

const createNodeDocument = async function (req: Request, res: Response) {
  logger.info('START [CreateNodeDocument]', req.body, req.params);
  try {
    if (!(req.body.uuid && req.body.manifest)) {
      res.status(400).send({ ok: false, message: 'Invalid data' });
      return;
    }

    const { uuid, manifest } = req.body;

    logger.info('[Backend REPO]:', backendRepo.networkSubsystem.peerId);

    const node = await prisma.node.findFirst({
      where: { uuid },
    });

    if (!node) {
      res.status(400).send({ ok: false, message: `Node with uuid ${uuid} not found!` });
      return;
    }

    const handle = backendRepo.create<ResearchObjectDocument>();
    handle.change((d) => {
      d.manifest = manifest;
      d.uuid = uuid.slice(0, -1);
    });

    await handle.doc();

    await prisma.node.update({ where: { id: node.id }, data: { manifestDocumentId: handle.documentId } });

    const document = await handle.doc();
    logger.info('[AUTOMERGE]::[HANDLE NEW CHANGED]', handle.url, handle.isReady(), document);

    res.status(200).send({ ok: true, documentId: handle.documentId });
    logger.info('END [CreateNodeDocument]', { documentId: handle.documentId });
  } catch (err) {
    console.log(err);
    res.status(500).send({ ok: false, message: JSON.stringify(err) });
    logger.error('END [CreateNodeDocument]', err);
  }
};

const getLatestNodeManifest = async function (req: Request, res: Response) {
  logger.info({ params: req.params }, 'START [getLatestNodeManifest]');
  try {
    if (!req.params.uuid) {
      res.status(400).send({ ok: false, message: 'Invalid data' });
      return;
    }

    const { uuid } = req.params;

    const node = await prisma.node.findFirst({
      where: { uuid },
    });

    if (!node) {
      res.status(400).send({ ok: false, message: `Node with uuid ${uuid} not found!` });
      return;
    }

    const automergeUrl = `automerge:${node.manifestDocumentId}`;
    const handle = backendRepo.find<ResearchObjectDocument>(automergeUrl as AutomergeUrl);

    const document = await handle.doc();

    logger.info({ document }, '[AUTOMERGE]::[Document Found]');

    logger.info('END [getLatestNodeManifest]', { manifest: document.manifest });
    res.status(200).send({ ok: true, manifest: document.manifest });
  } catch (err) {
    logger.error(err, 'Error [getLatestNodeManifest]');
    res.status(500).send({ ok: false, message: JSON.stringify(err) });
  }
};

export { createNodeDocument, getNodeDocument, getLatestNodeManifest };
