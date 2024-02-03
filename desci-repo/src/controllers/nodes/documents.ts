import { Request, Response } from 'express';
import { ResearchObjectDocument } from '../../types.js';
import { logger } from '../../logger.js';
import { AutomergeUrl, DocumentId } from '@automerge/automerge-repo';
import { RequestWithNode } from '../../middleware/guard.js';
import { backendRepo } from '../../repo.js';
import { ManifestActions, getAutomergeUrl, getDocumentUpdater } from '../../services/manifestRepo.js';
import { findNodeByUuid, query } from '../../db/index.js';
import { Doc } from '@automerge/automerge';
import { ZodError } from 'zod';
import { actionsSchema } from '../../validators/schema.js';

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

    const node = await findNodeByUuid(uuid + '.');
    // await prisma.node.update({ where: { id: node.id }, data: { manifestDocumentId: handle.documentId } });
    const result = await query('UPDATE "Node" SET "manifestDocumentId" = $1 WHERE uuid = $2', [
      handle.documentId,
      uuid,
    ]);

    console.log('UPDATE DOCUMENT ID', { node, result });
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

    logger.info('[END]:: GetLatestNodeManifest]', { manifest: document?.manifest });
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

    let document: Doc<ResearchObjectDocument> | undefined;

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

    res.status(500).send({ ok: false, message: JSON.stringify(err) });
  }
};

export const dispatchDocumentActions = async function (req: RequestWithNode, res: Response) {
  logger.info({ body: req.body }, 'START [dispatchDocumentActions]');
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

    const validatedActions = await actionsSchema.parseAsync(actions);
    logger.info({ validatedActions }, 'Actions validated');

    let document: Doc<ResearchObjectDocument> | undefined;

    const dispatchChange = getDocumentUpdater(documentId);

    for (const action of actions) {
      logger.info({ action }, '[AUTOMERGE]::[dispatch Update]');
      document = await dispatchChange(action);
    }

    if (!document) {
      res.status(400).send({ ok: false, message: 'Document not found' });
      return;
    }

    logger.info('END [dispatchDocumentActions]', { document });
    res.status(200).send({ ok: true, document });
  } catch (err) {
    logger.error(err, 'Error [dispatchDocumentChange]');

    if (err instanceof ZodError) {
      res.status(400).send({ ok: false, error: err });
      return;
    }

    res.status(500).send({ ok: false, message: JSON.stringify(err) });
  }
};
