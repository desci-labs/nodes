import { Client } from 'pg';

export interface DbDriver {
  query(query: string, values?: (string | number | object)[]): Promise<any[] | undefined>;
}

export default {
  async init(DATABASE_URL: string) {
    console.log('connect to db', DATABASE_URL);
    const client = new Client({ connectionString: DATABASE_URL });
    await client.connect();
    console.log('connected to db', client.database);

    return {
      async query(statement: string, values?: (string | number | object)[]) {
        try {
          const result = await client.query(statement, values);
          return result.rows;
        } catch (err) {
          console.error('[Hyperdrive Error]::', err);
          return undefined;
        }
      },
    };
  },
};
