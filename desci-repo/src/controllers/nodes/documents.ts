import { Request, Response } from 'express';
import server from '../../server.js';
import { ResearchObjectDocument } from '../../types.js';
import { ResearchObjectComponentType, ResearchObjectV1 } from '@desci-labs/desci-models';
import prisma from '../../client.js';
import { getLatestManifest } from './utils.js';
import logger from '../../logger.js';
import { RequestWithNode } from 'middleware/nodeGuard.js';

const researchObject: ResearchObjectV1 = {
  title: '',
  version: 'desci-nodes-0.2.0',
  components: [
    {
      id: 'root',
      name: 'root',
      type: ResearchObjectComponentType.DATA_BUCKET,
      payload: {
        cid: 'bafybeicrsddlvfbbo5s3upvjbtb5flc73iupxfy2kf3rv43kkbvegbqbwq',
        path: 'root',
      },
    },
  ],
  authors: [],
  researchFields: [],
  defaultLicense: 'CC BY',
};

const getNodeDocument = async function (req: RequestWithNode, res: Response) {
  try {
    console.log('START GetNodeDocument', req.user.id, req.node.uuid);
    const repo = server.repo;

    const node = req.node;

    if (!node) {
      logger.info({ module: 'GetNodeDocument' }, 'Node not found', 'Request Params', req.params);
      res.status(400).send({ ok: false, message: `Node with uuid ${req.params.uuid} not found!` });
      return;
    }

    const uuid = node.uuid;
    let documentId = node.manifestDocumentId;

    if (!documentId || documentId == '') {
      logger.info({ uuid, query: req?.query?.g, node }, 'Before GetLatestManifest');
      const manifest = await getLatestManifest(uuid, req.query?.g as string, node);
      logger.info({ uuid, manifest }, 'Node latest manifest');

      if (!manifest) {
        res.status(500).send({ ok: false, message: 'Error pulling node manifest' });
        return;
      }

      // Object.assign({}, researchObject) as ResearchObjectV1; // todo: pull latest draft manifest
      const handle = repo.create<ResearchObjectDocument>();
      logger.info({ manifest, doc: handle.documentId }, 'Create new document');
      handle.change((document) => {
        document.manifest = manifest;
        document.uuid = uuid.slice(0, -1);
      });
      logger.info('Initialized new document with Last published manfiest', { manifest });
      const document = await handle.doc();
      documentId = handle.documentId;
      await prisma.node.update({
        where: { id: node.id },
        data: { manifestDocumentId: handle.documentId },
      });
      const updatedNode = await prisma.node.findFirst({ where: { id: node.id } });
      logger.info({ document, updatedNode }, 'Node updated');
    }
    logger.info({ documentId }, 'End GetDocumentId');
    res.status(200).send({ documentId: documentId || '2ZNaMBfKDHRQU6aXC9KNt5zXggmB' });
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

    const repo = server.repo;
    logger.info('[Backend REPO]:', repo.networkSubsystem.peerId);

    const node = await prisma.node.findFirst({
      where: { uuid },
    });

    if (!node) {
      res.status(400).send({ ok: false, message: `Node with uuid ${uuid} not found!` });
      return;
    }

    const handle = repo.create<ResearchObjectDocument>();
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

export { createNodeDocument, getNodeDocument };
