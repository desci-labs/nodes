import { Client } from 'pg';

const pg = await import('pg').then((value) => value.default);
const { Pool } = pg;

// // export const pool = new Pool({
// //   connectionString: process.env.DATABASE_URL,
// //   options: '-c search_path=public',
// // });

// // pool.on('error', (err, client) => {
// //   // This is fine, client is booted out of the pool already when this happens
// //   console.warn('[db::pool] Unexpected error on idle client', err, client);
// // });

// // export const query = async (query: string, values?: (string | number | object)[]) => {
// //   try {
// //     const result = await pool.query(query, values ? values : undefined);
// //     return result.rows;
// //   } catch (err) {
// //     console.error('[QUERY ERROR]::', err);
// //     return undefined;
// //   }
// // };
export interface DbDriver {
  query(sql: string, values?: (string | number | object)[]): Promise<any[] | undefined>;
}

export default {
  async init(DATABASE_URL: string) {
    console.log('connect to db', DATABASE_URL);
    const pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      options: '-c search_path=public',
    });

    const client = await pool.connect();
    //  new Client({
    //   connectionString: DATABASE_URL,
    //   options: '-c search_path=public',
    // });

    client.on('error', (err) => {
      // This is fine, client is booted out of the pool already when this happens
      console.warn('[db::client] Unexpected error on idle client', err);
    });

    console.log('db client', client, DATABASE_URL);

    // await client.connect();

    return {
      async query(sql: string, values?: (string | number | object)[]) {
        try {
          const result = await client.query(sql, values ? values : undefined);
          return result.rows;
        } catch (err) {
          console.error('[QUERY ERROR]::', err);
          return undefined;
        }
      },
    };
  },
};
