import { defineConfig } from "drizzle-kit";
import "dotenv/config";

export default defineConfig({
  schema: "./drizzle/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    database: process.env.POSTGRES_DB as string,
    host: process.env.PG_HOST as string,
    user: process.env.POSTGRES_USER as string,
    password: process.env.POSTGRES_PASSWORD as string,
    secretArn: "",
    resourceArn: "",
    ssl: false,
  },
  schemaFilter: ["openalex", "public"],
  migrations: {
    table: "__migrations__",
    schema: "public",
  },
  verbose: true,
  strict: true,
});
