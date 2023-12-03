import fs from 'fs';
// import express from 'express';
import { WebSocketServer } from 'ws';
import { Repo, RepoConfig } from '@automerge/automerge-repo';
import { NodeWSServerAdapter } from '@automerge/automerge-repo-network-websocket';
import { NodeFSStorageAdapter } from '@automerge/automerge-repo-storage-nodefs';
import os from 'os';
import type { Server as HttpServer } from 'http';

const researchObject = {
  title: '',
  version: 'desci-nodes-0.2.0',
  components: [
    {
      id: 'root',
      name: 'root',
      type: 'data-bucket',
      payload: {
        cid: 'bafybeicrsddlvfbbo5s3upvjbtb5flc73iupxfy2kf3rv43kkbvegbqbwq',
        path: 'root',
      },
    },
  ],
  authors: [],
  researchFields: [],
  defaultLicense: 'CC BY',
};

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
    // @ts-ignore

    // app.post('/initialize', async (req, res) => {
    //   console.log(req.body, req.params, req.query);
    //   const uuid = req?.body.uuid;
    //   const handle = this.#repo.create();
    //   console.log('[AUTOMERGE]::[HANDLE NEW]', { uuid }, handle.url, handle.documentId);
    //   handle.change((d) => {
    //     d.manifest = researchObject;
    //     d.uuid = uuid;
    //   });
    //   this.nodeUuidToDocIcMap.set(uuid, handle.documentId);
    //   handle.docSync();

    //   const document = await handle.doc();
    //   console.log('[AUTOMERGE]::[HANDLE NEW CHANGED]', handle.url, handle.isReady(), document);
    //   res.send({ documentId: handle.documentId, uuid });
    // });

    // app.get('/documentId', (req, res) => {
    //   console.log('[AUTOMERGE]::[Lookup DocumentId]', req.query.uuid, this.nodeUuidToDocIcMap.get(req.query.uuid));
    //   res.send({ documentId: this.nodeUuidToDocIcMap.get(req.query.uuid) });
    // });

    // this.#server = app.listen(PORT, () => {
    //   console.log(`Listening on port ${PORT}`);
    //   this.#isReady = true;
    //   this.#readyResolvers.forEach((resolve) => resolve(true));
    // });

    this.#server.on('upgrade', (request, socket, head) => {
      console.log(`Server upgrade ${port}`);
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

// export default socketServer;
