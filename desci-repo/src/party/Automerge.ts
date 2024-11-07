// import os from 'node:os';

import { type PeerId, Repo } from '@automerge/automerge-repo/slim';
// import { NodeWSServerAdapter } from '@automerge/automerge-repo-network-websocket';
import { DurableObjectState } from '@cloudflare/workers-types';
// import {} from 'partykit/server';
import { routePartykitRequest, Server as PartyServer, Connection, ConnectionContext, WSMessage } from 'partyserver';
// import { PostgresStorageAdapter } from '../lib/PostgresStorageAdapter.js';
import { PartyKitWSServerAdapter } from './automerge-repo-network-websocket/PartykitWsServerAdapter.js';
import { DurableObjectStorageAdapter } from './automerge-repo-storage-durable-object/index.js';

// const hostname = os.hostname();

export class AutomergeServer extends PartyServer {
  repo: Repo;

  constructor(
    private readonly ctx: DurableObjectState,
    private readonly env,
  ) {
    super(ctx, env);
    console.log('Room: ', ctx.id);
  }

  async onStart(): Promise<void> {
    console.log('first connection to server');
    const { Repo } = await import('@automerge/automerge-repo');

    const config = {
      // network: [],
      //   storage: new PostgresStorageAdapter(),
      storage: new DurableObjectStorageAdapter(this.ctx.storage),
      peerId: `worker-server-${this.ctx.id}` as PeerId,
      // Since this is a server, we don't share generously — meaning we only sync documents they already
      // know about and can ask for by ID.
      sharePolicy: async (peerId, documentId) => {
        console.log('share policy called: ', { peerId, documentId });
        try {
          if (!documentId) {
            return false;
          }
          if (peerId.toString().length < 8) {
            return false;
          }

          const userId = peerId.split(':')?.[0]?.split('-')?.[1];
          // todo: make api request to desci-server
          const isAuthorised = true; // await verifyNodeDocumentAccess(Number(userId), documentId);
          //   logger.trace({ peerId, userId, documentId, isAuthorised }, '[SHARE POLICY CALLED]::');
          return isAuthorised;
        } catch (err) {
          //   logger.error({ err }, 'Error in share policy');
          return false;
        }
      },
    };

    this.repo = new Repo(config);
  }

  onConnect(connection: Connection, ctx: ConnectionContext): void | Promise<void> {
    console.log('[PARTYKIT]::onConnect', connection.url, connection.id, ctx.request.url);
    this.repo.networkSubsystem.addNetworkAdapter(new PartyKitWSServerAdapter(connection));
  }

  onMessage(connection: Connection, message: WSMessage): void | Promise<void> {
    // console.log('[party]::onMessage', connection.id);
    this.broadcast(message, [connection.id]);
  }

  onRequest(request: Request): Response | Promise<Response> {
    console.log('Incoming request', request.url, request.headers);
    return new Response('Hello from party server');
  }

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
