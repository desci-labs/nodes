import fs from 'fs';
// import express from 'express';
import { WebSocketServer } from 'ws';
import { Repo, RepoConfig } from '@automerge/automerge-repo';
import { NodeWSServerAdapter } from '@automerge/automerge-repo-network-websocket';
import { NodeFSStorageAdapter } from '@automerge/automerge-repo-storage-nodefs';
import os from 'os';
import type { Server as HttpServer } from 'http';
import { extractUserFromToken, extractAuthToken } from './middleware/permissions.js';
import logger from './logger.js';
import { Request } from 'express';

export default class SocketServer {
  #socket: WebSocketServer;

  #server: HttpServer;

  #readyResolvers: ((value: any) => void)[] = [];

  #isReady = false;

  repo: Repo;

  nodeUuidToDocIcMap = new Map();

  constructor(server: HttpServer, port: number) {
    this.#server = server;
    const dir = process.env.DATA_DIR !== undefined ? process.env.DATA_DIR : '.amrg';
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir);
    }

    var hostname = os.hostname();

    this.#socket = new WebSocketServer({ noServer: true, path: '/sync' });

    const adapter = new NodeWSServerAdapter(this.#socket);
    const config: RepoConfig = {
      network: [adapter],
      storage: new NodeFSStorageAdapter(dir),
      /** @ts-ignore @type {(import("@automerge/automerge-repo").PeerId)}  */
      peerId: `storage-server-${hostname}`,
      // Since this is a server, we don't share generously — meaning we only sync documents they already
      // know about and can ask for by ID.
      sharePolicy: async (peerId) => peerId !== 'anonymous',
    };
    this.repo = new Repo(config);

    //! REMOVE LATER, statically set uuid for demo
    this.nodeUuidToDocIcMap.set('ADyYCVqKaFrnDRr6I8FhRrn5eUuHG40-ANe-z_eh-ZY', '2ZNaMBfKDHRQU6aXC9KNt5zXggmB');

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
