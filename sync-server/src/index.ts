import {
  Doc,
  DocHandleChangePayload,
  DocHandleEvents,
  DocumentId,
  type PeerId,
  Repo,
} from '@automerge/automerge-repo/slim';
import { DurableObjectState } from '@cloudflare/workers-types';
import { routePartykitRequest, Server as PartyServer, Connection, ConnectionContext, WSMessage } from 'partyserver';
import { req, err as serialiseErr } from 'pino-std-serializers';
import { ManifestActions, ResearchObjectV1 } from '@desci-labs/desci-models';

import { PartyKitWSServerAdapter } from './automerge-repo-network-websocket/PartykitWsServerAdapter.js';

import database from './automerge-repo-storage-postgres/db.js';
import { PostgresStorageAdapter } from './automerge-repo-storage-postgres/PostgresStorageAdapter.js';
import { Env } from './types.js';
import { ensureUuidEndsWithDot } from './utils.js';
import { assert } from './automerge-repo-network-websocket/assert.js';
import { actionsSchema } from './lib/schema.js';
import { getAutomergeUrl, getDocumentUpdater } from './manifestRepo.js';
import { ZodError } from 'zod';

interface ResearchObjectDocument {
  manifest: ResearchObjectV1;
  uuid: string;
  driveClock: string;
}

// run a timeAlive loop to close connection in 30 secs if no other client aside the `worker-server-**` is connected
export class AutomergeServer extends PartyServer {
  // private options: {
  //   hibernate: true;
  // };

  repo: Repo;
  private API_TOKEN: string;
  private DATABASE_URL: string;
  private environment: string;

  constructor(
    private readonly ctx: DurableObjectState,
    private readonly env: Env,
  ) {
    super(ctx, env);
    console.log('Room: ', ctx.id, env);
    // Add sensible defaults for running worker using workered in docker container
    // without these defaults the worker crashes because runtime variable/secret bindings are all
    // when running in docker container
    this.environment = this.env.ENVIRONMENT || 'dev';
    const localDbUrl =
      this.env.DATABASE_URL ?? process.env.WRANGLER_HYPERDRIVE_LOCAL_CONNECTION_STRING_NODES_DB ?? '<DATABASE_URL>';
    this.DATABASE_URL = this.environment === 'dev' ? localDbUrl : this.env.NODES_DB.connectionString;
    this.API_TOKEN = env.API_TOKEN || 'auth-token';
    console.log('[Values]', { db: this.DATABASE_URL, api: this.API_TOKEN, env: this.environment });
  }

  async onStart(): Promise<void> {
    const { Repo } = await import('@automerge/automerge-repo');
    console.log('first connection to server', this.env);
    const { query } = await database.init(this.DATABASE_URL);
    const config = {
      storage: new PostgresStorageAdapter(query),
      peerId: `worker-server-${this.ctx.id}` as PeerId,
      // Since this is a server, we don't share generously — meaning we only sync documents they already
      // know about and can ask for by ID.
      sharePolicy: async (peer, docId) => {
        // console.log('SharePolicy called', { peer, docId });
        return true;
      },
    };

    this.repo = new Repo(config);

    const handleChange = async (change: DocHandleChangePayload<ResearchObjectDocument>) => {
      console.log({ change: change.handle.documentId, uuid: change.patchInfo.after.uuid }, 'Document Changed');
      const newTitle = change.patchInfo.after.manifest.title;
      const newCover = change.patchInfo.after.manifest.coverImage;
      const uuid = ensureUuidEndsWithDot(change.doc.uuid);
      // console.log({ uuid: uuid, newTitle }, 'UPDATE NODE');

      try {
        // TODO: Check if update message is 'UPDATE TITLE'
        if (newTitle) {
          const result = await query('UPDATE "Node" SET title = $1 WHERE uuid = $2', [newTitle, uuid]);
          // console.info({ newTitle, result }, 'TITLE UPDATED');
        }

        // TODO: Check if update message is 'UPDATE TITLE'
        // Update the cover image url in the db for fetching collection
        if (newCover) {
          const coverUrl = process.env.IPFS_RESOLVER_OVERRIDE + '/' + newCover;
          const result = await query(
            'INSERT INTO "NodeCover" (url, cid, "nodeUuid", version) VALUES ($1, $2, $3, $4) ON CONFLICT("nodeUuid", version) DO UPDATE SET url = $1, cid = $2',
            [coverUrl, newCover as string, uuid, 0],
          );
          // console.info({ uuid, coverUrl, result }, 'COVER UPDATED');
        }
      } catch (err) {
        console.error('[Error in DOCUMENT repo.ts::handleChange CALLBACK]', err);
        // console.error({err}, '[Error in DOCUMENT repo.ts::handleChange CALLBACK]');
      }
    };

    this.repo.on('document', async (doc) => {
      console.log({ documentId: doc.handle.documentId }, 'DOCUMENT Ready');
      doc.handle.on<keyof DocHandleEvents<'change'>>('change', handleChange);
    });

    this.repo.off('document', async (doc) => {
      doc.handle.off('change', handleChange);
    });
  }

  async onConnect(connection: Connection, ctx: ConnectionContext): Promise<void> {
    const url = new URL(ctx.request.url);
    const params = new URLSearchParams(url.search);

    const auth = params.get('auth');
    let isAuthorised = false;
    console.log('[onConnect]', { params });
    if (auth === this.API_TOKEN) {
      isAuthorised = true;
    } else {
      // Add default for missing NODES_API in workered container runtime
      // I'm still hunting down this bug, will probably open an issue on the
      // workered repo
      const authUrl = this.env.NODES_API ?? 'http://host.docker.internal:5420';
      const response = await fetch(`${authUrl}/v1/auth/check`, {
        headers: { Authorization: `Bearer ${auth}` },
      });

      if (response.ok) isAuthorised = true;
    }

    console.log('[onConnect]::isAuthorised', {
      isAuthorised,
      remotePeer: connection.id,
      source: this.API_TOKEN === auth ? 'server' : 'client',
    });
    if (isAuthorised) {
      this.repo.networkSubsystem.addNetworkAdapter(new PartyKitWSServerAdapter(connection));
    } else {
      console.log('Auth declined', { id: connection.id, server: connection.server });
      connection.close();
    }
  }

  onMessage(connection: Connection, message: WSMessage): void | Promise<void> {
    this.broadcast(message, [connection.id]);
  }

  onError(connection: Connection, error: unknown): void | Promise<void> {
    console.log('[Error]:', { id: connection.id, error: serialiseErr(error as Error) });
  }

  onClose(connection: Connection, code: number, reason: string, wasClean: boolean): void | Promise<void> {
    console.info('[close]:', { id: connection.id, url: connection.url, documentId: connection.server });
    try {
      connection.close();
    } catch (err) {
      console.error({ err, msg: 'Failed to close connection', code, reason, wasClean });
    }
  }
}

export const delay = async (timeMs: number) => {
  return new Promise((resolve) => setTimeout(resolve, timeMs));
};

async function handleCreateDocument(request: Request, env: Env) {
  console.log('[Request]::handleCreateDocument ', { env });
  const environment = env.ENVIRONMENT || 'dev';
  const localDbUrl =
    env.DATABASE_URL ?? process.env.WRANGLER_HYPERDRIVE_LOCAL_CONNECTION_STRING_NODES_DB ?? '<DATABASE_URL>';
  const DATABASE_URL = environment === 'dev' ? localDbUrl : env.NODES_DB.connectionString;

  const { Repo } = await import('@automerge/automerge-repo');
  const { query } = await database.init(DATABASE_URL);
  const config = {
    storage: new PostgresStorageAdapter(query),
    peerId: `cloudflare-ephemeral-peer` as PeerId,
    sharePolicy: async () => true,
  };

  const repo = new Repo(config);

  let body = (await request.clone().json()) as { uuid: string; manifest: ResearchObjectV1 };
  assert(body && body.uuid && body.manifest, 'Invalid request body');
  let uuid = ensureUuidEndsWithDot(body.uuid);

  const handle = repo.create<ResearchObjectDocument>();
  handle.change(
    (d) => {
      d.manifest = body.manifest;
      d.uuid = uuid;
      d.driveClock = Date.now().toString();
    },
    { message: 'Init Document', time: Date.now() },
  );

  let document = await handle.doc();
  await repo.flush();

  return new Response(JSON.stringify({ documentId: handle.documentId, document }), { status: 200 });
}

async function dispatchDocumentChanges(request: Request, env: Env) {
  try {
    console.log('[Request]::handleCreateDocument ', { env });
    const environment = env.ENVIRONMENT || 'dev';
    const localDbUrl =
      env.DATABASE_URL ?? process.env.WRANGLER_HYPERDRIVE_LOCAL_CONNECTION_STRING_NODES_DB ?? '<DATABASE_URL>';
    const DATABASE_URL = environment === 'dev' ? localDbUrl : env.NODES_DB.connectionString;

    const { Repo } = await import('@automerge/automerge-repo');
    const { query } = await database.init(DATABASE_URL);
    const config = {
      storage: new PostgresStorageAdapter(query),
      peerId: `cloudflare-ephemeral-peer` as PeerId,
      sharePolicy: async () => true,
    };

    const repo = new Repo(config);

    let body = (await request.clone().json()) as { uuid: string; documentId: DocumentId; actions: ManifestActions[] };
    const actions = body.actions as ManifestActions[];
    const documentId = body.documentId as DocumentId;

    if (!(actions && actions.length > 0)) {
      console.error({ body }, 'No actions to dispatch');
      return new Response(JSON.stringify({ ok: false, message: 'No actions to dispatch' }), { status: 400 });
    }

    let document: Doc<ResearchObjectDocument> | undefined;

    const dispatchChange = await getDocumentUpdater(repo, documentId);

    for (const action of actions) {
      document = await dispatchChange(action);
    }

    if (!document) {
      console.error({ document }, 'Document not found');
      return new Response(JSON.stringify({ ok: false, message: 'Document not found' }), { status: 400 });
    }

    await repo.flush();

    return new Response(JSON.stringify({ document, ok: true }), { status: 200 });
  } catch (err) {
    console.error(err, 'Error [dispatchDocumentChange]');

    if (err instanceof ZodError) {
      // res.status(400).send({ ok: false, error: err });
      return new Response(JSON.stringify({ ok: false, message: JSON.stringify(err) }), { status: 400 });
    }

    return new Response(JSON.stringify({ ok: false, message: JSON.stringify(err) }), { status: 500 });
  }
}

async function handleAutomergeActions(request: Request, env: Env) {
  try {
    console.log('[Request]::handleCreateDocument ', { env });
    const environment = env.ENVIRONMENT || 'dev';
    const localDbUrl =
      env.DATABASE_URL ?? process.env.WRANGLER_HYPERDRIVE_LOCAL_CONNECTION_STRING_NODES_DB ?? '<DATABASE_URL>';
    const DATABASE_URL = environment === 'dev' ? localDbUrl : env.NODES_DB.connectionString;

    const { Repo } = await import('@automerge/automerge-repo');
    const { query } = await database.init(DATABASE_URL);
    const config = {
      storage: new PostgresStorageAdapter(query),
      peerId: `cloudflare-ephemeral-peer` as PeerId,
      sharePolicy: async () => true,
    };

    const repo = new Repo(config);

    let body = (await request.clone().json()) as { uuid: string; documentId: DocumentId; actions: ManifestActions[] };
    const actions = body.actions as ManifestActions[];
    const documentId = body.documentId as DocumentId;

    if (!(actions && actions.length > 0)) {
      console.error({ body }, 'No actions to dispatch');
      return new Response(JSON.stringify({ ok: false, message: 'No actions to dispatch' }), { status: 400 });
    }

    const validatedActions = await actionsSchema.parseAsync(actions);
    console.log({ validatedActions }, 'Actions validated');

    let document: Doc<ResearchObjectDocument> | undefined;

    const dispatchChange = await getDocumentUpdater(repo, documentId);

    for (const action of actions) {
      document = await dispatchChange(action);
    }

    if (!document) {
      console.error({ document }, 'Document not found');
      return new Response(JSON.stringify({ ok: false, message: 'Document not found' }), { status: 400 });
    }

    await repo.flush();

    return new Response(JSON.stringify({ document, ok: true }), { status: 200 });
  } catch (err) {
    console.error(err, 'Error [dispatchDocumentChange]');

    if (err instanceof ZodError) {
      // res.status(400).send({ ok: false, error: err });
      return new Response(JSON.stringify({ ok: false, message: JSON.stringify(err) }), { status: 400 });
    }

    return new Response(JSON.stringify({ ok: false, message: JSON.stringify(err) }), { status: 500 });
  }
}

async function getLatestDocument(request: Request, env: Env) {
  try {
    console.log('[Request]::getLatestDocument ', { env });
    const environment = env.ENVIRONMENT || 'dev';
    const localDbUrl =
      env.DATABASE_URL ?? process.env.WRANGLER_HYPERDRIVE_LOCAL_CONNECTION_STRING_NODES_DB ?? '<DATABASE_URL>';
    const DATABASE_URL = environment === 'dev' ? localDbUrl : env.NODES_DB.connectionString;

    const { Repo } = await import('@automerge/automerge-repo');
    const { query } = await database.init(DATABASE_URL);
    const config = {
      storage: new PostgresStorageAdapter(query),
      peerId: `cloudflare-ephemeral-peer` as PeerId,
      sharePolicy: async () => true,
    };

    const repo = new Repo(config);
    const url = new URL(request.url);
    const documentId = url.searchParams.get('documentId') as DocumentId;
    if (!documentId) {
      console.error('No DocumentID found');
      return new Response(JSON.stringify({ ok: false, message: 'Invalid body' }), { status: 400 });
    }

    let document: Doc<ResearchObjectDocument> | undefined;

    const handle = repo.find<ResearchObjectDocument>(getAutomergeUrl(documentId));
    document = await handle.doc();
    console.log('Document Retrieved', { document: !!document });

    return new Response(JSON.stringify({ document, ok: true }), { status: 200 });
  } catch (err) {
    console.error({ err }, 'Error [getLatestDocument]');

    return new Response(JSON.stringify({ ok: false, message: JSON.stringify(err) }), { status: 500 });
  }
}

export default {
  fetch(request: Request, env) {
    const secretKey = env.ENVIRONMENT === null ? 'test-api-secret' : env.API_TOKEN;
    console.log('Request Fetch:', {
      env,
      url: request.url,
    });
    if (request.url.includes('/api/') && request.headers.get('x-api-key') != secretKey) {
      console.log('[Error]::Api key error');
      return new Response('UnAuthorized', { status: 401 });
    }

    if (request.url.includes('/api/documents') && request.method.toLowerCase() === 'get')
      return getLatestDocument(request, env);

    if (request.url.includes('/api/documents/actions') && request.method.toLowerCase() === 'post')
      return handleAutomergeActions(request, env);

    if (request.url.includes('/api/documents/dispatch') && request.method.toLowerCase() === 'post')
      return dispatchDocumentChanges(request, env);

    if (request.url.includes('/api/documents') && request.method.toLowerCase() === 'post')
      return handleCreateDocument(request, env);

    if (!request.url.includes('/parties/automerge')) return new Response('Not found', { status: 404 });
    return routePartykitRequest(request, env) || new Response('Not found', { status: 404 });
  },
};
