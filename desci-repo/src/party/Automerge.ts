// import os from 'node:os';

import { type PeerId, Repo } from '@automerge/automerge-repo/slim';
// import { NodeWSServerAdapter } from '@automerge/automerge-repo-network-websocket';
import { DurableObjectState } from '@cloudflare/workers-types';
// import {} from 'partykit/server';
import { routePartykitRequest, Server as PartyServer, Connection, ConnectionContext, WSMessage } from 'partyserver';
// import { PostgresStorageAdapter } from '../lib/PostgresStorageAdapter.js';
import { PartyKitWSServerAdapter } from './automerge-repo-network-websocket/PartykitWsServerAdapter.js';
import { DurableObjectStorageAdapter } from './automerge-repo-storage-durable-object/index.js';

import database from './automerge-repo-storage-postgres/db.js';
import { PostgresStorageAdapter } from './automerge-repo-storage-postgres/adapter.js';
import { Env } from './types.js';
// const hostname = os.hostname();

export class AutomergeServer extends PartyServer {
  repo: Repo;

  constructor(
    private readonly ctx: DurableObjectState,
    private readonly env: Env,
  ) {
    super(ctx, env);
    console.log('Room: ', ctx.id, env);
  }

  async onStart(): Promise<void> {
    console.log('first connection to server');
    const { Repo } = await import('@automerge/automerge-repo');
    // const { query } = await database.init(this.env.DATABASE_URL);
    const config = {
      // network: [],
      // storage: new PostgresStorageAdapter(query),
      storage: new DurableObjectStorageAdapter(this.ctx.storage),
      peerId: `worker-server-${this.ctx.id}` as PeerId,
      // Since this is a server, we don't share generously — meaning we only sync documents they already
      // know about and can ask for by ID.
      sharePolicy: async () => true,
    };

    this.repo = new Repo(config);
  }

  async onConnect(connection: Connection, ctx: ConnectionContext): Promise<void> {
    const url = new URL(ctx.request.url);
    const params = new URLSearchParams(url.search);
    console.log('[PARTYKIT]::onConnect', params);

    const auth = params.get('auth');
    // console.log('auth', auth, this.env.NODES_API);
    const response = await fetch(`${this.env.NODES_API}/v1/auth/check`, {
      headers: { Authorization: `Bearer ${auth}` },
    });
    if (response.ok) {
      this.repo.networkSubsystem.addNetworkAdapter(new PartyKitWSServerAdapter(connection));
    } else {
      connection.close();
    }
  }

  onMessage(connection: Connection, message: WSMessage): void | Promise<void> {
    this.broadcast(message, [connection.id]);
  }

  // onRequest(request: Request): Response | Promise<Response> {
  //   console.log('Incoming request', request.url, request.headers);
  //   return new Response('Hello from party server');
  // }

  onError(connection: Connection, error: unknown): void | Promise<void> {
    console.log('Party Server Error: ', connection.id, error);
  }

  onClose(connection: Connection, code: number, reason: string, wasClean: boolean): void | Promise<void> {
    console.log('Close connection', { id: connection.id, code, reason, wasClean });

    try {
      connection.close();
    } catch (err) {
      console.log('Failed to close connection');
    }
  }
}

export default {
  fetch(request, env) {
    // console.log('Incoming request', request.url);
    return routePartykitRequest(request, env) || new Response('Not found', { status: 404 });
  },
};
