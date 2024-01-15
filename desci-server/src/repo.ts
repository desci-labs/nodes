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
    // peer format: `peer-[user#id]:[unique string combination]
    if (peerId.toString().length < 8) return false;

    const userId = peerId.split(':')?.[0]?.split('-')?.[1];
    const isAuthorised = await verifyNodeDocumentAccess(Number(userId), documentId);
    logger.trace({ peerId, userId, documentId, isAuthorised }, '[SHARE POLICY CALLED]::');
    return isAuthorised;
  },
};
export const backendRepo = new Repo(config);
const handleChange = async (change: DocHandleChangePayload<ResearchObjectDocument>) => {
  logger.trace({ change: change.handle.documentId, uuid: (await change.handle.doc()).uuid }, 'Document Changed');
  const newTitle = change.patchInfo.after.manifest.title;
  const uuid = change.doc.uuid;
  logger.info({ uuid: uuid + '.', newTitle }, 'UPDATE NODE');

  await prisma.node.updateMany({
    where: { uuid: uuid + '.' },
    data: { title: newTitle },
  });
};

backendRepo.on('document', async (doc) => {
  doc.handle.on<keyof DocHandleEvents<'change'>>('change', handleChange);
});

backendRepo.off('document', async (doc) => {
  doc.handle.off('change', handleChange);
});

// todo: Recover from RangeError -> reset repo and return a new instance
