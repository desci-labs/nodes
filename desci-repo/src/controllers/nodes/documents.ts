import { Request, Response } from 'express';
import { ResearchObjectDocument } from '../../types.js';
import { logger as parentLogger } from '../../logger.js';
import { AutomergeUrl, DocumentId } from '@automerge/automerge-repo';
import { RequestWithNode } from '../../middleware/guard.js';
import { backendRepo } from '../../repo.js';
import { getAutomergeUrl, getDocumentUpdater } from '../../services/manifestRepo.js';
import { findNodeByUuid, query } from '../../db/index.js';
import { Doc } from '@automerge/automerge';
import { ZodError } from 'zod';
import { actionsSchema } from '../../validators/schema.js';
import { ensureUuidEndsWithDot } from './utils.js';
import { ManifestActions } from '@desci-labs/desci-models';

export const createNodeDocument = async function (req: Request, res: Response) {
  const logger = parentLogger.child({ module: 'createNodeDocument', body: req.body, param: req.params });
  logger.trace('createNodeDocument');

  try {
    if (!(req.body.uuid && req.body.manifest)) {
      res.status(400).send({ ok: false, message: 'Invalid data' });
      return;
    }

    let { uuid, manifest } = req.body;
    uuid = ensureUuidEndsWithDot(uuid);
    logger.info({ peerId: backendRepo.networkSubsystem.peerId, uuid }, '[Backend REPO]:');
    const handle = backendRepo.create<ResearchObjectDocument>();
    handle.change(
      (d) => {
        d.manifest = manifest;
        d.uuid = uuid;
        d.driveClock = Date.now().toString();
      },
      { message: 'Init Document', time: Date.now() },
    );

    logger.trace({ peerId: backendRepo.networkSubsystem.peerId, uuid }, 'Document Created');

    // const document = await handle.doc();

    logger.trace({ handleReady: handle.isReady() }, 'Document Retrieved');

    // const node = await findNodeByUuid(uuid);
    // logger.trace({ node }, 'Node Retrieved');
    // await prisma.node.update({ where: { id: node.id }, data: { manifestDocumentId: handle.documentId } });
    // const result = await query('UPDATE "Node" SET "manifestDocumentId" = $1 WHERE uuid = $2', [
    //   handle.documentId,
    //   uuid,
    // ]);

    // logger.trace(
    //   { node, uuid, documentId: handle.documentId, url: handle.url, isReady: handle.isReady() },
    //   'Node Updated',
    // );

    // logger.info({ result }, 'UPDATE DOCUMENT ID');

    res.status(200).send({ ok: true, documentId: handle.documentId, document });

    logger.info({ documentId: handle.documentId, document }, 'END');
  } catch (err) {
    logger.error({ err }, 'Error');
    res.status(500).send({ ok: false, message: JSON.stringify(err) });
  }
};

export const getLatestNodeManifest = async function (req: Request, res: Response) {
  const logger = parentLogger.child({ module: 'getLatestNodeManifest', params: req.params });
  logger.trace('getLatestNodeManifest');

  try {
    if (!req.params.uuid) {
      res.status(400).send({ ok: false, message: 'Invalid data' });
      logger.trace('No UUID FOUND');
      return;
    }

    const { uuid } = req.params;
    const node = await findNodeByUuid(ensureUuidEndsWithDot(uuid));
    logger.trace({ node }, 'Retrieve Node');

    if (!node) {
      logger.warn({ uuid }, `Node with uuid ${uuid} not found!`);
      res.status(400).send({ ok: false, message: `Node with uuid ${uuid} not found!` });
      return;
    }

    logger.info(
      { manifestDocumentId: node.manifestDocumentId, url: getAutomergeUrl(node.manifestDocumentId) },
      'Node manifestDocumentId',
    );

    const automergeUrl = getAutomergeUrl(node.manifestDocumentId as DocumentId);
    const handle = backendRepo.find<ResearchObjectDocument>(automergeUrl as AutomergeUrl);
    logger.trace({ uuid, automergeUrl }, 'Document Handle retrieved');

    logger.trace({ uuid, automergeUrl }, 'Get DOCUMENT');
    const document = await handle.doc();
    logger.trace({ uuid, automergeUrl }, 'DOCUMENT Retrieved');

    logger.info({ manifest: document?.manifest, automergeUrl }, '[getLatestNodeManifest::END]');
    res.status(200).send({ ok: true, document });
  } catch (err) {
    logger.error({ err }, 'Error');
    res.status(500).send({ ok: false, message: JSON.stringify(err) });
  }
};

export const dispatchDocumentChange = async function (req: RequestWithNode, res: Response) {
  const logger = parentLogger.child({ module: 'dispatchDocumentChange', body: req.body, params: req.params });
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

    logger.info({ actions }, 'Actions');
    for (const action of actions) {
      document = await dispatchChange(action);
    }

    if (!document) {
      res.status(400).send({ ok: false, message: 'Document not found' });
      return;
    }

    res.status(200).send({ ok: true, document });
    logger.trace('END');
  } catch (err) {
    logger.error({ err }, 'Error [dispatchDocumentChange]');
    res.status(500).send({ ok: false, message: JSON.stringify(err) });
  }
};

export const dispatchDocumentActions = async function (req: RequestWithNode, res: Response) {
  const logger = parentLogger.child({ module: 'dispatchDocumentActions' });
  logger.info({ body: req.body }, 'START [dispatchDocumentActions]');
  try {
    if (!(req.body.uuid && req.body.documentId && req.body.actions)) {
      logger.error({ body: req.body }, 'Invalid data');
      res.status(400).send({ ok: false, message: 'Invalid data' });
      return;
    }

    const actions = req.body.actions as ManifestActions[];
    const documentId = req.body.documentId as DocumentId;

    if (!(actions && actions.length > 0)) {
      logger.error({ actions }, 'No actions to dispatch');
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
      logger.error({ document }, 'Document not found');
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
