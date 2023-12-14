import fs from 'fs';
import type { Server as HttpServer } from 'http';
import os from 'os';

import { PeerId, Repo, RepoConfig } from '@automerge/automerge-repo';
import { NodeWSServerAdapter } from '@automerge/automerge-repo-network-websocket';
import { Request } from 'express';
import { WebSocketServer } from 'ws';

import { prisma } from './client.js';
import { PostgresStorageAdapter } from './lib/PostgresStorageAdapter.js';
import { logger } from './logger.js';
import { extractUserFromToken, extractAuthToken } from './middleware/permissions.js';
import { verifyNodeDocumentAccess } from './services/permissions.js';
export default class SocketServer {
  #socket: WebSocketServer;

  #server: HttpServer;

  #readyResolvers: ((value: any) => void)[] = [];

  #isReady = false;

  repo: Repo;

  constructor(server: HttpServer, port: number) {
    const dir = process.env.DATA_DIR !== undefined ? process.env.DATA_DIR : '.amrg';
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir);
    }

    this.#server = server;
    const hostname = os.hostname();
    this.#socket = new WebSocketServer({ noServer: true, path: '/sync' });

    const adapter = new NodeWSServerAdapter(this.#socket);
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
        logger.info({ peerId, userId, documentId, isAuthorised }, '[SHARE POLICY CALLED]::');
        return isAuthorised;
      },
    };
    this.repo = new Repo(config);

    this.#server.on('upgrade', async (request, socket, head) => {
      console.log(`Server upgrade ${port}`, request.headers.cookie);
      const token = await extractAuthToken(request as Request);
      const authUser = await extractUserFromToken(token);

      logger.info(
        { module: 'WebSocket SERVER', token, ...(authUser && { id: authUser.id, name: authUser.name }) },
        'Upgrade Connection Authorised',
      );
      if (!authUser) {
        return;
      }

      this.#socket.handleUpgrade(request, socket, head, (socket) => {
        console.log(`WS Server upgrade ${port}`);
        this.#socket.emit('connection', socket, request);
      });
    });
  }

  async ready() {
    if (this.#isReady) {
      return true;
    }

    return new Promise((resolve) => {
      this.#readyResolvers.push(resolve);
    });
  }

  close() {
    this.#socket.close();
    this.#server.close();
  }
}
