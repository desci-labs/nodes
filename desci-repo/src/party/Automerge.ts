import { type PeerId, Repo } from '@automerge/automerge-repo/slim';
import { DurableObjectState } from '@cloudflare/workers-types';
import { routePartykitRequest, Server as PartyServer, Connection, ConnectionContext, WSMessage } from 'partyserver';
import { PartyKitWSServerAdapter } from './automerge-repo-network-websocket/PartykitWsServerAdapter.js';

import database from './automerge-repo-storage-postgres/db.js';
import { PostgresStorageAdapter } from './automerge-repo-storage-postgres/adapter.js';
import { Env } from './types.js';

// run a timeAlive loop to close connection in 30 secs if no other client aside the `worker-server-**` is connected
export class AutomergeServer extends PartyServer {
  repo: Repo;

  constructor(
    private readonly ctx: DurableObjectState,
    private readonly env: Env,
  ) {
    super(ctx, env);
    console.log('Room: ', ctx.id, env.NODES_DB.connectionString);
  }

  async onStart(): Promise<void> {
    const { Repo } = await import('@automerge/automerge-repo');
    console.log('first connection to server', this.env.NODES_DB.connectionString);
    const dbUrl = this.env.ENVIRONMENT === 'local' ? this.env.DATABASE_URL : this.env.NODES_DB.connectionString;
    const { query } = await database.init(dbUrl);
    const config = {
      storage: new PostgresStorageAdapter(query),
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

    const auth = params.get('auth');
    let isAuthorised = false;

    console.log('CONNECT', { auth, id: connection.id, server: connection.server, url: connection.url });

    if (auth === this.env.API_TOKEN) {
      isAuthorised = true;
    } else {
      const response = await fetch(`${this.env.NODES_API}/v1/auth/check`, {
        headers: { Authorization: `Bearer ${auth}` },
      });

      if (response.ok) isAuthorised = true;
    }
    if (isAuthorised) {
      this.repo.networkSubsystem.addNetworkAdapter(new PartyKitWSServerAdapter(connection));
    } else {
      connection.close();
    }
  }

  onMessage(connection: Connection, message: WSMessage): void | Promise<void> {
    this.broadcast(message, [connection.id]);
    // console.log('[peers]:', this.repo.peers);
  }

  onError(connection: Connection, error: unknown): void | Promise<void> {
    console.log('[Error]:', { id: connection.id, error });
  }

  onClose(connection: Connection, code: number, reason: string, wasClean: boolean): void | Promise<void> {
    console.log('[close]:', { id: connection.id, url: connection.url, documentId: connection.server });
    try {
      connection.close();
    } catch (err) {
      console.error({ err, msg: 'Failed to close connection', code, reason, wasClean });
    }
  }
}

export default {
  fetch(request: Request, env) {
    return routePartykitRequest(request, env) || new Response('Not found', { status: 404 });
  },
};
