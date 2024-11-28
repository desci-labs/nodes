import { Client, Pool } from 'pg';
import { err as serialiseErr } from 'pino-std-serializers';

export interface DbDriver {
  query(query: string, values?: (string | number | object)[]): Promise<any[] | undefined>;
}

export default {
  async init(connectionString: string) {
    console.log('[Hyperdrive] ✅', { connectionString });
    const pool = new Pool({ connectionString, connectionTimeoutMillis: 15000, query_timeout: 1000 });
    pool.on('error', (err) => console.error('[Hyperdrive Error]::', { error: serialiseErr(err as Error), pool }));

    return {
      // pool,
      async query(statement: string, values?: (string | number | object)[]) {
        try {
          console.log('[query] ⏰', { statement, values });
          const result = await pool.query(statement, values);
          console.log('[query:::done] ✅', { result: result.rowCount });
          return result.rows;
        } catch (err) {
          console.error('[Hyperdrive Error]::', { error: serialiseErr(err as Error), pool });
          return undefined;
        } finally {
          // client.release();
        }
      },
    };
  },
};
