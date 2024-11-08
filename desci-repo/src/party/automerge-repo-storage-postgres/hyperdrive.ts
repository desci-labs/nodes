import { ExecutionContext, ExportedHandler, Response, Request } from '@cloudflare/workers-types';
import postgres from 'postgres';
import { Env } from '../types.js';

export interface RequestPayload {
  key: string;
}

export interface SavePayload {
  key: string;
  binary: Uint8Array;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    // NOTE: if `prepare: false` is passed when connecting, performance will
    // be slower but still correctly supported.
    const sql = postgres(env.DATABASE_URL, { prepare: true });

    try {
      const { key } = (await request.json()) as RequestPayload;
      // A very simple test query
      const result = await sql`SELECT * FROM ${env.DB_TABLE}" WHERE key = $${key}`;

      // Clean up the client, ensuring we don't kill the worker before that is
      // completed.
      ctx.waitUntil(sql.end());

      // Return result rows as JSON
      return Response.json({ result: result }) as Response;
    } catch (e) {
      console.log(e);
      return Response.json({ error: e.message }, { status: 500 });
    }
  },
} satisfies ExportedHandler<Env>;
