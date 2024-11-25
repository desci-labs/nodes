import os from 'os';

import {
  DocHandleChangePayload,
  DocHandleEvents,
  DocumentId,
  PeerId,
  Repo,
  RepoConfig,
} from '@automerge/automerge-repo';
import WebSocket from 'isomorphic-ws';
import { logger as parentLogger } from './logger.js';
import { ResearchObjectDocument } from './types.js';
import * as db from './db/index.js';
import { ensureUuidEndsWithDot } from './controllers/nodes/utils.js';
import { PartykitNodeWsAdapter } from './lib/PartykitNodeWsAdapter.js';

const partyServerHost = process.env.PARTY_SERVER_URL || 'wss://localhost:5445';
const partyServerToken = process.env.PARTY_SERVER_TOKEN;
const isDev = process.env.NODE_ENV == 'dev';
const isTest = process.env.NODE_ENV == 'test';

if (!(partyServerToken && partyServerHost)) {
  throw new Error('Missing ENVIRONMENT variables: PARTY_SERVER_URL or PARTY_SERVER_TOKEN');
}

const logger = parentLogger.child({ module: 'repo.ts' });

logger.info({ partyServerHost, partyServerToken }, 'Env checked');

const hostname = os.hostname();

const config: RepoConfig = {
  peerId: `repo-server-${hostname}` as PeerId,
  // Since this is a server, we don't share generously — meaning we only sync documents they already
  // know about and can ask for by ID.
  sharePolicy: async (peerId, documentId) => {
    logger.trace({ peerId, documentId }, 'SharePolicy: ');
    return true;
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

class RepoManager {
  clients: Map<string, PartykitNodeWsAdapter> = new Map();
  intervalId: ReturnType<typeof setInterval>;

  constructor(private repo: Repo) {}

  isConnected(documentId: DocumentId) {
    return this.clients.has(documentId);
  }

  connect(documentId: DocumentId) {
    logger.trace({ documentId, isDev, exists: this.clients.has(documentId) }, 'RepoManager#Connect');
    const adapter = new PartykitNodeWsAdapter({
      host: partyServerHost,
      party: 'automerge',
      room: documentId,
      query: { auth: partyServerToken },
      protocol: isDev || isTest ? 'ws' : 'wss',
      WebSocket: WebSocket,
    });

    this.repo.networkSubsystem.addNetworkAdapter(adapter);

    this.repo.networkSubsystem.on('peer-disconnected', (peer) => {
      if (peer.peerId === adapter.remotePeerId) {
        // clean up adapater and it's document handle after timeout
        setTimeout(() => {
          logger.trace(
            {
              peer: peer.peerId,
              remotePeerId: adapter.remotePeerId,
              documentId,
              socketState: adapter.socket?.readyState,
            },
            'Post disconnect',
          );
          if (adapter.socket?.readyState !== WebSocket.OPEN) this.cleanUp(documentId);
        }, 60000);
      }
      logger.trace(
        { peer: peer.peerId, remotePeerId: adapter.remotePeerId, documentId, socketState: adapter.socket?.readyState },
        'peer-disconnected',
      );
    });

    this.clients.set(documentId, adapter);
  }

  /**
   * Clean up a connection and it's handle to free memory effectively
   * @param documentId
   */
  cleanUp(documentId) {
    const adapter = this.clients.get(documentId);
    if (adapter) {
      this.repo.networkSubsystem.removeNetworkAdapter(adapter);
      this.clients.delete(documentId);
      // const handle = this.repo.find(documentId);
      // handle.unload();
      // delete this.repo.handles[documentId];
      logger.trace({ documentId }, ' RepoManager#cleanUp');
    }
  }
}

export const repoManager = new RepoManager(backendRepo);
