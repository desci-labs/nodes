import os from 'os';

import { DocHandleChangePayload, DocHandleEvents, PeerId, Repo, RepoConfig } from '@automerge/automerge-repo';
import { NodeWSServerAdapter } from '@automerge/automerge-repo-network-websocket';
import { WebSocketServer } from 'ws';

import { PostgresStorageAdapter } from './lib/PostgresStorageAdapter.js';
import { logger as parentLogger } from './logger.js';
import { verifyNodeDocumentAccess } from './services/nodes.js';
import { ResearchObjectDocument } from './types.js';
import * as db from './db/index.js';
import { ensureUuidEndsWithDot } from './controllers/nodes/utils.js';

export const socket = new WebSocketServer({
  port: process.env.WS_PORT ? parseInt(process.env.WS_PORT) : 5445,
  path: '/sync',
});
const hostname = os.hostname();

const logger = parentLogger.child({ module: 'repo.ts' });

const adapter = new NodeWSServerAdapter(socket);
const config: RepoConfig = {
  network: [adapter],
  storage: new PostgresStorageAdapter(),
  peerId: `storage-server-${hostname}` as PeerId,
  // Since this is a server, we don't share generously — meaning we only sync documents they already
  // know about and can ask for by ID.
  sharePolicy: async (peerId, documentId) => {
    try {
      if (!documentId) {
        logger.trace({ peerId }, 'SharePolicy: Document ID NOT found');
        return false;
      }
      // peer format: `peer-[user#id]:[unique string combination]
      if (peerId.toString().length < 8) {
        logger.error({ peerId }, 'SharePolicy: Peer ID invalid');
        return false;
      }

      const userId = peerId.split(':')?.[0]?.split('-')?.[1];
      const isAuthorised = await verifyNodeDocumentAccess(Number(userId), documentId);
      logger.trace({ peerId, userId, documentId, isAuthorised }, '[SHARE POLICY CALLED]::');
      return isAuthorised;
    } catch (err) {
      logger.error({ err }, 'Error in share policy');
      return false;
    }
  },
};
export const backendRepo = new Repo(config);
const handleChange = async (change: DocHandleChangePayload<ResearchObjectDocument>) => {
  logger.trace({ change: change.handle.documentId, uuid: change.patchInfo.after.uuid }, 'Document Changed');
  const newTitle = change.patchInfo.after.manifest.title;
  const newCover = change.patchInfo.after.manifest.coverImage;
  const uuid = ensureUuidEndsWithDot(change.doc.uuid);
  logger.info({ uuid: uuid, newTitle }, 'UPDATE NODE');

  try {
    // TODO: Check if update message is 'UPDATE TITLE'
    if (newTitle) {
      const result = await db.query('UPDATE "Node" SET title = $1 WHERE uuid = $2', [newTitle, uuid]);
      logger.info({ newTitle, result }, 'TITLE UPDATED');
    }

    // TODO: Check if update message is 'UPDATE TITLE'
    // Update the cover image url in the db for fetching collection
    if (newCover) {
      const coverUrl = process.env.IPFS_RESOLVER_OVERRIDE + '/' + newCover;
      const result = await db.query(
        'INSERT INTO "NodeCover" (url, cid, "nodeUuid", version) VALUES ($1, $2, $3, $4) ON CONFLICT("nodeUuid", version) DO UPDATE SET url = $1, cid = $2',
        [coverUrl, newCover as string, uuid, 0],
      );
      logger.info({ uuid, coverUrl, result }, 'COVER UPDATED');
    }
  } catch (err) {
    console.error('[Error in DOCUMENT repo.ts::handleChange CALLBACK]', err);
    logger.error(err, '[Error in DOCUMENT repo.ts::handleChange CALLBACK]');
  }
};

backendRepo.on('document', async (doc) => {
  doc.handle.on<keyof DocHandleEvents<'change'>>('change', handleChange);
});

backendRepo.off('document', async (doc) => {
  doc.handle.off('change', handleChange);
});

// todo: Recover from RangeError -> reset repo and return a new instance
