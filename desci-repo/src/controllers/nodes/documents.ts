import { Request, Response } from 'express';
import { ResearchObjectDocument } from '../../types.js';
// import { getLatestManifest } from './utils.js';
import { logger } from '../../logger.js';
import { AutomergeUrl, DocumentId } from '@automerge/automerge-repo';
import { RequestWithNode } from '../../middleware/guard.js';
import { backendRepo } from '../../repo.js';
import { ManifestActions, getAutomergeUrl, getDocumentUpdater } from '../../services/manifestRepo.js';
import { findNodeByUuid, query } from '../../db/index.js';
// import * as db from '../../db/index.js';

// const getNodeDocument = async function (req: RequestWithNode, res: Response) {
//   try {
//     console.log('[START GetNodeDocument]', req.user.id, req.node.uuid);

//     const node = req.node;

//     if (!node) {
//       logger.info({ module: 'GetNodeDocument' }, 'Node not found', 'Request Params', req.params);
//       res.status(400).send({ ok: false, message: `Node with uuid ${req.params.uuid} not found!` });
//       return;
//     }

//     const parsedUuid = node.uuid.slice(0, -1) as NodeUuid;

//     let documentId = node.manifestDocumentId;
//     let document: ResearchObjectDocument | null = null;

//     if (!documentId || documentId == '') {
//       logger.info({ parsedUuid, query: req?.query?.g, node }, 'Before GetLatestManifest');
//       const manifest = await getLatestManifest(node.uuid, req.query?.g as string, node);
//       logger.info({ parsedUuid, manifest }, 'Node latest manifest');

//       if (!manifest) {
//         res.status(500).send({ ok: false, message: 'Error pulling node manifest' });
//         return;
//       }

//       // Object.assign({}, researchObject) as ResearchObjectV1; // todo: pull latest draft manifest
//       const handle = backendRepo.create<ResearchObjectDocument>();
//       logger.info({ manifest, doc: handle.documentId }, 'Create new document');
//       handle.change(
//         (document) => {
//           document.manifest = manifest;
//           document.uuid = parsedUuid;
//           document.driveClock = Date.now().toString();
//         },
//         { message: 'Init Document', time: Date.now() },
//       );

//       document = await handle.doc();
//       documentId = handle.documentId;
//       logger.info('Initialized new document with Last published manfiest', { manifest });

//       const result = await db.query('UPDATE "Node" SET manifestDocumentId = $1 WHERE id = $2 RETURNING *', [
//         handle.documentId,
//         node.id,
//       ]);
//       console.log('Node UPDATED', result);

//       const updatedNode = result[0];
//       logger.info({ document, updatedNode }, 'Node updated');
//     } else {
//       const handle = backendRepo.find<ResearchObjectDocument>(documentId as AnyDocumentId);
//       document = await handle.doc();
//       if (document.uuid !== parsedUuid && handle.isReady()) {
//         handle.change(
//           (document) => {
//             document.uuid = parsedUuid;
//           },
//           { message: 'Update Document', time: Date.now() },
//         );
//       }
//       document = await handle.doc();
//     }
//     logger.info({ documentId }, 'End GetDocumentId');
//     res.status(200).send({ ok: true, documentId, document });
//   } catch (err) {
//     logger.error('Creating new document Error', req.body, err);
//     console.log(err);
//     res.status(500).send({ ok: false, message: JSON.stringify(err) });
//   }
// };

export const createNodeDocument = async function (req: Request, res: Response) {
  logger.info('START [CreateNodeDocument]', req.body, req.params);
  try {
    if (!(req.body.uuid && req.body.manifest)) {
      res.status(400).send({ ok: false, message: 'Invalid data' });
      return;
    }

    let { uuid, manifest } = req.body;

    logger.info('[Backend REPO]:', backendRepo.networkSubsystem.peerId);

    uuid = uuid.endsWith('.') ? uuid.slice(0, -1) : uuid;
    const handle = backendRepo.create<ResearchObjectDocument>();
    handle.change(
      (d) => {
        d.manifest = manifest;
        d.uuid = uuid;
        d.driveClock = Date.now().toString();
      },
      { message: 'Init Document', time: Date.now() },
    );

    const document = await handle.doc();

    // await prisma.node.update({ where: { id: node.id }, data: { manifestDocumentId: handle.documentId } });
    const result = await query('UPDATE "Node" SET "manifestDocumentId" = $1 WHERE uuid = $2', [
      handle.documentId,
      uuid,
    ]);

    console.log('UPDATE DOCUMENT ID', result);
    logger.info('[AUTOMERGE]::[HANDLE NEW CHANGED]', handle.url, handle.isReady(), document);

    res.status(200).send({ ok: true, documentId: handle.documentId, document });
    logger.info('END [CreateNodeDocument]', { documentId: handle.documentId, document });
  } catch (err) {
    console.error('Error [CreateNodeDocument]', err);
    logger.error('END [CreateNodeDocument]', err);
    res.status(500).send({ ok: false, message: JSON.stringify(err) });
  }
};

export const getLatestNodeManifest = async function (req: Request, res: Response) {
  logger.info({ params: req.params }, 'START [getLatestNodeManifest]');
  try {
    console.log('[getLatestNodeManifest]', req.params);
    if (!req.params.uuid) {
      res.status(400).send({ ok: false, message: 'Invalid data' });
      return;
    }

    const { uuid } = req.params;

    // const queryResult = await pool.query('SELECT * FROM nodes WHERE uuid = $1', [uuid]);
    // console.log('user:', queryResult.rows[0]);

    console.log('[getLatestNodeManifest]', { uuid });
    const node = await findNodeByUuid(uuid);
    console.log('[node]', { node });

    if (!node) {
      res.status(400).send({ ok: false, message: `Node with uuid ${uuid} not found!` });
      return;
    }

    const automergeUrl = getAutomergeUrl(node.manifestDocumentId as DocumentId);
    const handle = backendRepo.find<ResearchObjectDocument>(automergeUrl as AutomergeUrl);

    const document = await handle.doc();

    logger.info('[END]:: GetLatestNodeManifest]', { manifest: document.manifest });
    res.status(200).send({ ok: true, document });
  } catch (err) {
    console.error('Error [getLatestNodeManifest]', err);
    logger.error(err, 'Error [getLatestNodeManifest]');
    res.status(500).send({ ok: false, message: JSON.stringify(err) });
  }
};

export const dispatchDocumentChange = async function (req: RequestWithNode, res: Response) {
  logger.info({ params: req.params }, 'START [dispatchDocumentChange]');
  try {
    if (!(req.body.uuid && req.body.documentId && req.body.actions)) {
      res.status(400).send({ ok: false, message: 'Invalid data' });
      return;
    }

    const actions = req.body.actions as ManifestActions[];
    const documentId = req.body.documentId as DocumentId;

    if (!(actions && actions.length > 0)) {
      res.status(400).send({ ok: false, message: 'No actions to dispatch' });
      return;
    }

    let document: ResearchObjectDocument;

    const dispatchChange = getDocumentUpdater(documentId);

    for (const action of actions) {
      logger.info({ action }, '[AUTOMERGE]::[dispatch Update]');
      document = await dispatchChange(action);
    }

    if (!document) {
      res.status(400).send({ ok: false, message: 'Document not found' });
      return;
    }

    logger.info('END [dispatchDocumentChange]', { document });
    res.status(200).send({ ok: true, document });
  } catch (err) {
    logger.error(err, 'Error [dispatchDocumentChange]');
    console.error('Error [dispatchDocumentChange]', err);
    res.status(500).send({ ok: false, message: JSON.stringify(err) });
  }
};
