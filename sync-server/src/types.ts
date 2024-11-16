import { Hyperdrive } from '@cloudflare/workers-types';

export interface Env {
  // If you set another name in wrangler.toml as the value for 'binding',
  // replace "HYPERDRIVE" with the variable name you defined.
  NODES_DB: Hyperdrive;
  DATABASE_URL: string;
  DB_TABLE: string;
  NODES_API: string;
  ENVIRONMENT: string;
  API_TOKEN: string;
}
