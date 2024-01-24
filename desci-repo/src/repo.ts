import os from 'os';

import { DocHandleChangePayload, DocHandleEvents, PeerId, Repo, RepoConfig } from '@automerge/automerge-repo';
import { NodeWSServerAdapter } from '@automerge/automerge-repo-network-websocket';
import { WebSocketServer } from 'ws';

import { PostgresStorageAdapter } from './lib/PostgresStorageAdapter.js';
import { logger } from './logger.js';
import { verifyNodeDocumentAccess } from './services/nodes.js';
import { ResearchObjectDocument } from './types.js';
import * as db from './db/index.js';

export const socket = new WebSocketServer({ port: 5445, path: '/sync' });
const hostname = os.hostname();

const adapter = new NodeWSServerAdapter(socket);
const config: RepoConfig = {
  network: [adapter],
  storage: new PostgresStorageAdapter(),
  peerId: `storage-server-${hostname}` as PeerId,
  // Since this is a server, we don't share generously — meaning we only sync documents they already
  // know about and can ask for by ID.
  sharePolicy: async (peerId, documentId) => {
    try {
      // peer format: `peer-[user#id]:[unique string combination]
      if (peerId.toString().length < 8) return false;

      const userId = peerId.split(':')?.[0]?.split('-')?.[1];
      console.log('VERIFY USER', userId);
      const isAuthorised = await verifyNodeDocumentAccess(Number(userId), documentId);
      console.log('[SHARE POLICY CALLED]::', { peerId, userId, documentId, isAuthorised });
      return isAuthorised;
    } catch (err) {
      logger.error({ err }, 'Error in share policy');
      return false;
    }
  },
};
export const backendRepo = new Repo(config);
const handleChange = async (change: DocHandleChangePayload<ResearchObjectDocument>) => {
  logger.trace({ change: change.handle.documentId, uuid: (await change.handle.doc()).uuid }, 'Document Changed');
  const newTitle = change.patchInfo.after.manifest.title;
  const newCover = change.patchInfo.after.manifest.coverImage;
  const uuid = change.doc.uuid.endsWith('.') ? change.doc.uuid : change.doc.uuid + '.';
  logger.info({ uuid: uuid + '.', newTitle }, 'UPDATE NODE');

  try {
    // TODO: Check if update message is 'UPDATE TITLE'
    if (newTitle) {
      const result = await db.query('UPDATE "Node" SET title = $1 WHERE uuid = $2', [newTitle, uuid]);
      console.log('TITLE UPDATED', newTitle, result);
    }

    // TODO: Check if update message is 'UPDATE TITLE'
    // Update the cover image url in the db for fetching collection
    if (newCover) {
      const coverUrl = process.env.IPFS_RESOLVER_OVERRIDE + '/' + newCover;
      console.log('[COVER] UPDATE', coverUrl);
      const result = await db.query(
        'INSERT INTO "NodeCover" (url, cid, "nodeUuid", version) VALUES ($1, $2, $3, $4) ON CONFLICT("nodeUuid", version) DO UPDATE SET url = $1, cid = $2',
        [coverUrl, newCover as string, uuid, 0],
      );
      console.log('COVER UPDATED', result);
    }
  } catch (err) {
    console.error('[Error in DOCUMENT CHANG HANDLER CALLBACK]', err);
    logger.error(err, '[Error in DOCUMENT CHANG HANDLER CALLBACK]');
  }
};

backendRepo.on('document', async (doc) => {
  doc.handle.on<keyof DocHandleEvents<'change'>>('change', handleChange);
});

backendRepo.off('document', async (doc) => {
  doc.handle.off('change', handleChange);
});

// todo: Recover from RangeError -> reset repo and return a new instance
