import { Doc } from '@automerge/automerge';
import { AutomergeUrl, DocumentId } from '@automerge/automerge-repo';
import { ManifestActions } from '@desci-labs/desci-models';
import { Request, Response } from 'express';
import { ZodError } from 'zod';

import { findNodeByUuid } from '../../db/index.js';
import { logger as parentLogger } from '../../logger.js';
import { RequestWithNode } from '../../middleware/guard.js';
import { backendRepo, repoManager } from '../../repo.js';
import { getAutomergeUrl, getDocumentUpdater } from '../../services/manifestRepo.js';
import { ResearchObjectDocument } from '../../types.js';
import { actionsSchema } from '../../validators/schema.js';

import { ensureUuidEndsWithDot } from './utils.js';
import { IS_DEV, IS_TEST, PARTY_SERVER_HOST, PARTY_SERVER_TOKEN } from '../../config.js';

const protocol = IS_TEST || IS_DEV ? 'http://' : 'https://';

const getDocument = async (documentId: DocumentId) => {
  const logger = parentLogger.child({ module: 'getDocument', documentId });

  if (!repoManager.isConnected(documentId)) {
    repoManager.connect(documentId);
  }

  const automergeUrl = getAutomergeUrl(documentId);
  await backendRepo.networkSubsystem.whenReady();
  logger.trace({ documentId }, 'ready');
  const handle = backendRepo.find<ResearchObjectDocument>(automergeUrl as AutomergeUrl);
  logger.trace({ handle: handle.url }, 'handle resolved');
  const document = await handle.doc();
  logger.trace({ automergeUrl, Retrieved: !!document, document }, 'DOCUMENT Retrieved');
  return document;
};

export const createNodeDocument = async function (req: Request, res: Response) {
  const logger = parentLogger.child({ module: 'createNodeDocument' });

  try {
    if (!(req.body.uuid && req.body.manifest)) {
      res.status(400).send({ ok: false, message: 'Invalid data' });
      return;
    }

    let { uuid, manifest } = req.body;
    logger.trace({ protocol, PARTY_SERVER_HOST, PARTY_SERVER_TOKEN }, 'ENV');
    const response = await fetch(`${protocol}${PARTY_SERVER_HOST}/api/documents`, {
      method: 'POST',
      body: JSON.stringify({ uuid, manifest }),
    });
    const data = await response.json();

    logger.trace({ uuid }, 'Document Created');
    res.status(200).send({ ok: true, ...data });
  } catch (err) {
    logger.error({ err }, '[Error]::createNodeDocument');
    res.status(500).send({ ok: false, message: JSON.stringify(err) });
  }
};

export const getLatestNodeManifest = async function (req: Request, res: Response) {
  const logger = parentLogger.child({ module: 'getLatestNodeManifest', query: req.query, params: req.params });
  const { uuid } = req.params;
  const { documentId } = req.query;

  try {
    // todo: add support for documentId params and skip querying node
    // fast track call if documentId is available
    if (documentId) {
      const document = await getDocument(documentId as DocumentId);
      if (document) {
        res.status(200).send({ ok: true, document });
        return;
      }
    }

    // calls might never reach this place again now that documentId is
    // used to fast track calls and skip database calls
    if (!uuid) {
      res.status(400).send({ ok: false, message: 'Invalid data' });
      logger.trace('No UUID FOUND');
      return;
    }

    const node = await findNodeByUuid(ensureUuidEndsWithDot(uuid));
    logger.trace({ node }, 'Retrieve Node');

    if (!node) {
      logger.warn({ uuid }, `Node with uuid ${uuid} not found!`);
      res.status(404).send({ ok: false, message: `Node with uuid ${uuid} not found!` });
      return;
    }

    if (!node.manifestDocumentId) {
      res.status(404).send({ ok: false, message: `node: ${uuid} has no documentId: ${node.manifestDocumentId}` });
      return;
    }

    const document = await getDocument(node.manifestDocumentId as DocumentId);

    logger.trace({ document: !!document }, 'return DOCUMENT');
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

    const dispatchChange = await getDocumentUpdater(documentId);

    for (const action of actions) {
      document = await dispatchChange(action);
    }

    if (!document) {
      res.status(400).send({ ok: false, message: 'Document not found' });
      return;
    }

    res.status(200).send({ ok: true, document });
  } catch (err) {
    logger.error({ err }, 'Error [dispatchDocumentChange]');
    res.status(500).send({ ok: false, message: JSON.stringify(err) });
  }
};

export const dispatchDocumentActions = async function (req: RequestWithNode, res: Response) {
  const logger = parentLogger.child({ module: 'dispatchDocumentActions' });
  try {
    if (!(req.body.uuid && req.body.documentId && req.body.actions)) {
      logger.error({ body: req.body }, 'Invalid data');
      res.status(400).send({ ok: false, message: 'Invalid data' });
      return;
    }

    const actions = req.body.actions as ManifestActions[];
    const documentId = req.body.documentId as DocumentId;

    if (!(actions && actions.length > 0)) {
      logger.error({ body: req.body }, 'No actions to dispatch');
      res.status(400).send({ ok: false, message: 'No actions to dispatch' });
      return;
    }

    const validatedActions = await actionsSchema.parseAsync(actions);
    logger.trace({ validatedActions }, 'Actions validated');

    let document: Doc<ResearchObjectDocument> | undefined;

    const dispatchChange = await getDocumentUpdater(documentId);

    for (const action of actions) {
      document = await dispatchChange(action);
    }

    if (!document) {
      logger.error({ document }, 'Document not found');
      res.status(400).send({ ok: false, message: 'Document not found' });
      return;
    }

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
