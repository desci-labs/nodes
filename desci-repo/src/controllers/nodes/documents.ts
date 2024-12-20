import os from 'os';

import { Doc } from '@automerge/automerge';
import { AutomergeUrl, DocHandleEphemeralMessagePayload, DocumentId, PeerId, Repo } from '@automerge/automerge-repo';
import { ManifestActions, ResearchObjectV1 } from '@desci-labs/desci-models';
import { Request, Response } from 'express';
import WebSocket from 'isomorphic-ws';
import { ZodError } from 'zod';

import { ENABLE_PARTYKIT_FEATURE, IS_DEV, IS_TEST, PARTY_SERVER_HOST, PARTY_SERVER_TOKEN } from '../../config.js';
import { findNodeByUuid } from '../../db/index.js';
import { PartykitNodeWsAdapter } from '../../lib/PartykitNodeWsAdapter.js';
import { logger as parentLogger } from '../../logger.js';
import { RequestWithNode } from '../../middleware/guard.js';
import { backendRepo, repoManager } from '../../repo.js';
import { getAutomergeUrl, getDocumentHandle, getDocumentUpdater } from '../../services/manifestRepo.js';
import { ResearchObjectDocument } from '../../types.js';
import { actionsSchema } from '../../validators/schema.js';

import { ensureUuidEndsWithDot } from './utils.js';

const protocol = IS_TEST || IS_DEV ? 'http://' : 'https://';
const hostname = os.hostname();

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

    let uuid = req.body.uuid;
    const manifest = req.body.manifest;
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

    const document = await handle.doc();

    res.status(200).send({ ok: true, document, documentId: handle.documentId });
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
    console.log('[getLatestNodeManifest]', { documentId, ENABLE_PARTYKIT_FEATURE });
    if (documentId) {
      if (ENABLE_PARTYKIT_FEATURE) {
        const response = await fetch(`${protocol}${PARTY_SERVER_HOST}/api/documents?documentId=${documentId}`, {
          // body: JSON.stringify({ uuid, documentId }),
          headers: {
            'x-api-key': PARTY_SERVER_TOKEN!,
          },
        });
        const data = (await response.json()) as { document: ResearchObjectV1 };

        logger.trace({ document: !!data.document, ENABLE_PARTYKIT_FEATURE }, 'Document Retrieved');
        res.status(200).send({ ok: true, document: data.document });
        return;
      } else {
        const document = await getDocument(documentId as DocumentId);
        if (document) {
          res.status(200).send({ ok: true, document });
          return;
        }
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

    if (ENABLE_PARTYKIT_FEATURE) {
      const response = await fetch(`${protocol}${PARTY_SERVER_HOST}/api/documents?documentId=${documentId}`, {
        headers: {
          'x-api-key': PARTY_SERVER_TOKEN!,
        },
      });
      const data = (await response.json()) as { document: ResearchObjectV1 };

      logger.trace({ document: !!data.document, ENABLE_PARTYKIT_FEATURE }, 'Document Retrieved');
      res.status(200).send({ ok: true, document: data.document });
      return;
    } else {
      const document = await getDocument(node.manifestDocumentId as DocumentId);

      logger.trace({ document: !!document, ENABLE_PARTYKIT_FEATURE }, 'return DOCUMENT');
      res.status(200).send({ ok: true, document });
      return;
    }
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

    // const repo = new Repo({
    //   peerId: `repo-server-${hostname}` as PeerId,
    //   // Since this is a server, we don't share generously — meaning we only sync documents they already
    //   // know about and can ask for by ID.
    //   sharePolicy: async () => true,
    // });
    // const adapter = new PartykitNodeWsAdapter({
    //   host: PARTY_SERVER_HOST!,
    //   party: 'automerge',
    //   room: documentId,
    //   query: { auth: PARTY_SERVER_TOKEN, documentId },
    //   protocol: IS_DEV || IS_TEST ? 'ws' : 'wss',
    //   WebSocket: WebSocket,
    // });
    // repo.networkSubsystem.addNetworkAdapter(adapter);
    // await repo.networkSubsystem.whenReady();

    // const handle = repo.find<ResearchObjectDocument>(getAutomergeUrl(documentId));
    // handle.broadcast([documentId, { type: 'dispatch-changes', actions }]);

    // // await new Promise((resolve) => setTimeout(resolve, 2000));
    // // console.log('[TIMEOUT]', { documentId, actions });
    // logger.trace({ documentId, actions }, 'Actions');

    let document: Doc<ResearchObjectDocument> | undefined;

    const dispatchChange = await getDocumentUpdater(documentId);

    // await new Promise((resolve) => setTimeout(resolve, 5000));

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

    // const handle = await getDocumentHandle(documentId);
    // const repo = new Repo({
    //   peerId: `repo-server-${hostname}` as PeerId,
    //   // Since this is a server, we don't share generously — meaning we only sync documents they already
    //   // know about and can ask for by ID.
    //   sharePolicy: async () => true,
    // });
    // const adapter = new PartykitNodeWsAdapter({
    //   host: PARTY_SERVER_HOST!,
    //   party: 'automerge',
    //   room: documentId,
    //   query: { auth: PARTY_SERVER_TOKEN, documentId },
    //   protocol: IS_DEV || IS_TEST ? 'ws' : 'wss',
    //   WebSocket: WebSocket,
    // });
    // repo.networkSubsystem.addNetworkAdapter(adapter);
    // await repo.networkSubsystem.whenReady();

    // const handle = repo.find<ResearchObjectDocument>(getAutomergeUrl(documentId));
    // handle.broadcast([documentId, { type: 'dispatch-action', actions }]);

    // logger.trace({ documentId, validatedActions }, 'Actions');

    let document: Doc<ResearchObjectDocument> | undefined;

    const dispatchChange = await getDocumentUpdater(documentId, actions);
    // await new Promise((resolve) => setTimeout(resolve, 300));

    for (const action of actions) {
      document = await dispatchChange(action);
    }

    logger.trace({ actions, document }, '[Post Action]');
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
