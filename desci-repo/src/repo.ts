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
import { PostgresStorageAdapter } from './lib/PostgresStorageAdapter.js';
import { NodeWSServerAdapter } from '@automerge/automerge-repo-network-websocket';
import { WebSocketServer } from 'ws';
import { verifyNodeDocumentAccess } from './services/nodes.js';
import { ENABLE_PARTYKIT_FEATURE, IS_DEV, IS_TEST, PARTY_SERVER_HOST } from './config.js';

const partyServerHost = PARTY_SERVER_HOST || 'localhost:5445';
const partyServerToken = process.env.PARTY_SERVER_TOKEN;

const logger = parentLogger.child({ module: 'repo.ts' });

if (ENABLE_PARTYKIT_FEATURE && !(partyServerToken && partyServerHost)) {
  throw new Error('Missing ENVIRONMENT variables: PARTY_SERVER_HOST or PARTY_SERVER_TOKEN');
}

const hostname = os.hostname();

logger.trace({ partyServerHost, partyServerToken, serverName: os.hostname() ?? 'no-hostname' }, 'Env checked');

let config: RepoConfig;
let socket: WebSocketServer;

if (ENABLE_PARTYKIT_FEATURE) {
  config = {
    peerId: `repo-server-${hostname}` as PeerId,
    // Since this is a server, we don't share generously — meaning we only sync documents they already
    // know about and can ask for by ID.
    sharePolicy: async (peerId, documentId) => {
      logger.trace({ peerId, documentId }, 'SharePolicy called');
      return true;
    },
  };
} else {
  socket = new WebSocketServer({
    port: process.env.WS_PORT ? parseInt(process.env.WS_PORT) : 5445,
    path: '/sync',
  });

  const adapter = new NodeWSServerAdapter(socket);

  config = {
    network: [adapter],
    storage: new PostgresStorageAdapter(),
    peerId: `repo-server-${hostname}` as PeerId,
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
}

export { socket };

export const backendRepo = new Repo(config);

// move logic to sync server
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
  logger.trace({ documentId: doc.handle.documentId }, 'DOCUMENT Ready');
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
    if (!ENABLE_PARTYKIT_FEATURE) return true;
    return this.clients.has(documentId);
  }

  connect(documentId: DocumentId) {
    logger.trace({ documentId, IS_DEV, IS_TEST, exists: this.clients.has(documentId) }, 'RepoManager#Connect');
    const adapter = new PartykitNodeWsAdapter({
      host: partyServerHost,
      party: 'automerge',
      room: documentId,
      query: { auth: partyServerToken },
      protocol: IS_DEV || IS_TEST ? 'ws' : 'wss',
      WebSocket: WebSocket,
    });

    // adapter.on('ready', (ready) => logger.trace({ ready: ready.network.peerId }, 'networkReady'));
    this.repo.networkSubsystem.addNetworkAdapter(adapter);

    this.repo.networkSubsystem.on('peer-disconnected', (peer) => {
      if (peer.peerId === adapter.remotePeerId) {
        // clean up adapater and it's document handle after timeout
        // setTimeout(() => {
        //   logger.trace(
        //     {
        //       peer: peer.peerId,
        //       remotePeerId: adapter.remotePeerId,
        //       documentId,
        //       socketState: adapter.socket?.readyState,
        //     },
        //     'Post disconnect',
        //   );
        //   if (adapter.socket?.readyState !== WebSocket.OPEN || !adapter?.socket) this.cleanUp(documentId);
        // }, 60000);
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
      // this.repo.networkSubsystem.removeNetworkAdapter(adapter);
      this.clients.delete(documentId);
      // const handle = this.repo.find(documentId);
      // handle.unload();
      // delete this.repo.handles[documentId];
      logger.trace({ documentId }, ' RepoManager#cleanUp');
    }
  }
}

export const repoManager = new RepoManager(backendRepo);
