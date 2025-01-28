import { defineConfig } from 'drizzle-kit';
import 'dotenv/config';

export default defineConfig({
  schema: ['./drizzle/schema.ts', './drizzle/batches-schema.ts'],
  out: './drizzle/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    database: process.env.POSTGRES_DB as string,
    host: process.env.PG_HOST as string,
    user: process.env.POSTGRES_USER as string,
    port: parseInt(process.env.PG_PORT || '5432'),
    password: process.env.POSTGRES_PASSWORD as string,
    secretArn: '',
    resourceArn: '',
    ssl: false,
  },
  schemaFilter: ['openalex', 'public'],
  migrations: {
    table: '__migrations__',
    schema: 'public',
  },
  introspect: {
    casing: 'preserve',
  },
  casing: 'snake_case',
  verbose: true,
  strict: true,
});
