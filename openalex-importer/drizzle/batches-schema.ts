import { serial, integer, text, timestamp, primaryKey, index, pgEnum } from 'drizzle-orm/pg-core';
import { openalex as openAlexSchema, worksInOpenalex } from "./schema.js";


export const batchesInOpenAlex = openAlexSchema.table("batch", {
  id: serial().primaryKey(),
  started_at: timestamp({ mode: "date" }).defaultNow(),
  finished_at: timestamp({ mode: "date" }),
  /** Type of filtering in OA query: either 'created' or 'updated */
  query_type: text().notNull(),
  query_from: timestamp({ mode: "date" }).notNull(),
  query_to: timestamp({ mode: "date" }).notNull(),
});

export const workBatchesInOpenAlex = openAlexSchema.table("works_batch", {
  work_id: text().references(() => worksInOpenalex.id, { onDelete: "set null" }),
  batch_id: integer().references(() => batchesInOpenAlex.id, { onDelete: "set null" }),
}, (table) => [
  primaryKey({ columns: [ table.work_id, table.batch_id ]}),
  // Lookups what batches affected a given work (update log)
  index('work_batches_work_id_idx').on(table.work_id),
  // Lookup what works were affected by a given batch (update log)
  index('work_batches_batch_id_idx').on(table.batch_id),
]);
