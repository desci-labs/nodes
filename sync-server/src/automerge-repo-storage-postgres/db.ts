import { Client, Pool } from 'pg';
import { err as serialiseErr } from 'pino-std-serializers';

export interface DbDriver {
  query(query: string, values?: (string | number | object)[]): Promise<any[] | undefined>;
}

export default {
  async init(connectionString: string) {
    console.log('[Hyperdrive] ✅', { connectionString });
    const pool = new Pool({ connectionString });

    return {
      // pool,
      async query(statement: string, values?: (string | number | object)[]) {
        const client = await pool.connect();
        try {
          const result = await client.query(statement, values);
          return result.rows;
        } catch (err) {
          console.error('[Hyperdrive Error]::', { error: serialiseErr(err as Error), pool });
          return undefined;
        } finally {
          client.release();
        }
      },
    };
  },
};
