import os from 'os';

import { DocHandleChangePayload, DocHandleEvents, PeerId, Repo, RepoConfig } from '@automerge/automerge-repo';
import { NodeWSServerAdapter } from '@automerge/automerge-repo-network-websocket';
import { WebSocketServer } from 'ws';

import { prisma } from './client.js';
import { PostgresStorageAdapter } from './lib/PostgresStorageAdapter.js';
import { logger } from './logger.js';
import { verifyNodeDocumentAccess } from './services/permissions.js';
import { ResearchObjectDocument } from './types/documents.js';

export const socket = new WebSocketServer({ port: 5445, path: '/sync' });
const hostname = os.hostname();

const adapter = new NodeWSServerAdapter(socket);
const config: RepoConfig = {
  network: [adapter],
  storage: new PostgresStorageAdapter(prisma),
  peerId: `storage-server-${hostname}` as PeerId,
  // Since this is a server, we don't share generously — meaning we only sync documents they already
  // know about and can ask for by ID.
  sharePolicy: async (peerId, documentId) => {
    try {
      // peer format: `peer-[user#id]:[unique string combination]
      if (peerId.toString().length < 8) return false;

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
  try {
    logger.info({ change: change.handle.documentId, doc: change.patchInfo.after.manifest }, 'Document Changed');
    const newTitle = change.patchInfo.after.manifest.title;
    const node = await prisma.node.findFirst({ where: { manifestDocumentId: change.handle.documentId } });
    logger.info({ node }, 'UPDATE Node');

    await prisma.node.update({ where: { id: node.id }, data: { title: newTitle } });
  } catch (err) {
    logger.error({ err }, 'Error updating node');
  }
};

backendRepo.on('document', async (doc) => {
  doc.handle.on<keyof DocHandleEvents<'change'>>('change', handleChange);
});

backendRepo.off('document', async (doc) => {
  doc.handle.off('change', handleChange);
});

// todo: Recover from RangeError -> reset repo and return a new instance
