import { Hyperdrive } from '@cloudflare/workers-types';

export interface Env {
  NODES_DB: Hyperdrive;
  DATABASE_URL: string;
  DB_TABLE: string;
  NODES_API: string;
  ENVIRONMENT: string;
  API_TOKEN: string;
}
