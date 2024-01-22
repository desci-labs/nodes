import os from 'os';

import { DocHandleChangePayload, DocHandleEvents, PeerId, Repo, RepoConfig } from '@automerge/automerge-repo';
import { NodeWSServerAdapter } from '@automerge/automerge-repo-network-websocket';
import { WebSocketServer } from 'ws';

import { prisma } from './client.js';
import { PostgresStorageAdapter } from './lib/PostgresStorageAdapter.js';
import { logger } from './logger.js';
import { verifyNodeDocumentAccess } from './services/nodes.js';
import { ResearchObjectDocument } from './types.js';

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
  logger.trace({ change: change.handle.documentId, uuid: (await change.handle.doc()).uuid }, 'Document Changed');
  const newTitle = change.patchInfo.after.manifest.title;
  const newCover = change.patchInfo.after.manifest.coverImage;
  const uuid = change.doc.uuid.endsWith('.') ? change.doc.uuid : change.doc.uuid + '.';
  logger.info({ uuid: uuid + '.', newTitle }, 'UPDATE NODE');

  try {
    await prisma.node.updateMany({
      where: { uuid },
      data: { title: newTitle },
    });

    // Update the cover image url in the db for fetching collection
    if (newCover) {
      const coverUrl = process.env.IPFS_RESOLVER_OVERRIDE + newCover;
      await prisma.nodeCover.upsert({
        where: { nodeUuid_version: { nodeUuid: uuid + '.', version: 0 } },
        update: { url: coverUrl, cid: newCover as string },
        create: { nodeUuid: uuid + '.', url: coverUrl, cid: newCover as string },
      });
    }
  } catch (err) {
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
