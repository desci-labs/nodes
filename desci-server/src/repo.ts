import os from 'os';

import { PeerId, Repo, RepoConfig } from '@automerge/automerge-repo';
import { NodeWSServerAdapter } from '@automerge/automerge-repo-network-websocket';
import { WebSocketServer } from 'ws';

import { prisma } from './client.js';
import { PostgresStorageAdapter } from './lib/PostgresStorageAdapter.js';
import { logger } from './logger.js';
import { verifyNodeDocumentAccess } from './services/permissions.js';

export const socket = new WebSocketServer({ noServer: true, path: '/sync/' });
const hostname = os.hostname();

const adapter = new NodeWSServerAdapter(socket);
const config: RepoConfig = {
  network: [adapter],
  storage: new PostgresStorageAdapter(prisma),
  peerId: `storage-server-${hostname}` as PeerId,
  // Since this is a server, we don't share generously — meaning we only sync documents they already
  // know about and can ask for by ID.
  sharePolicy: async (peerId, documentId) => {
    // peer format: `peer-[user#id]:[unique string combination]
    if (peerId.toString().length < 8) return false;

    const userId = peerId.split(':')?.[0]?.split('-')?.[1];
    const isAuthorised = await verifyNodeDocumentAccess(Number(userId), documentId);
    // const handle = repo.find(`automerge:${documentId}` as AutomergeUrl);
    // const changes = await A.getAllChanges(await handle.doc())
    //   .map((change, i) => {
    //     return A.decodeChange(change);
    //   })
    //   .map((c) => {
    //     delete c.ops;
    //     return c;
    //   });
    logger.info({ peerId, userId, documentId, isAuthorised }, '[SHARE POLICY CALLED]::');
    return isAuthorised;
  },
};
export const backendRepo = new Repo(config);
