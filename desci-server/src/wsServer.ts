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
  _socket: WebSocketServer;

  _server: HttpServer;

  _readyResolvers: ((value: any) => void)[] = [];

  _isReady = false;

  repo: Repo;

  nodeUuidToDocIcMap = new Map();

  constructor(server: HttpServer, port: number) {
    this._server = server;
    const dir = process.env.DATA_DIR !== undefined ? process.env.DATA_DIR : '.amrg';
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir);
    }

    const hostname = os.hostname();

    this._socket = new WebSocketServer({ noServer: true, path: '/sync' });

    const adapter = new NodeWSServerAdapter(this._socket);
    const config: RepoConfig = {
      network: [adapter],
      storage: new PostgresStorageAdapter(prisma),
      // storage: new NodeFSStorageAdapter(dir),
      peerId: `storage-server-${hostname}` as PeerId,
      // Since this is a server, we don't share generously — meaning we only sync documents they already
      // know about and can ask for by ID.
      sharePolicy: async (peerId, documentId) => {
        // peer format: `peer-[user_id]:[unique string combination]
        if (peerId.toString().length < 8) return false;

        const userId = peerId.split(':')?.[0]?.split('-')?.[1];
        const isAuthorised = await verifyNodeDocumentAccess(Number(userId), documentId);
        logger.info({ peerId, documentId, isAuthorised }, '[SHARE POLICY CALLED]::');
        return isAuthorised;
      },
    };
    this.repo = new Repo(config);

    this._server.on('upgrade', async (request, socket, head) => {
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

      this._socket.handleUpgrade(request, socket, head, (socket) => {
        console.log(`WS Server upgrade ${port}`);
        this._socket.emit('connection', socket, request);
      });
    });
  }

  async ready() {
    if (this._isReady) {
      return true;
    }

    return new Promise((resolve) => {
      this._readyResolvers.push(resolve);
    });
  }

  close() {
    this._socket.close();
    this._server.close();
  }
}
