import { serial, integer, text, timestamp } from "drizzle-orm/pg-core";
import { openalex as openAlexSchema, worksInOpenalex } from "./schema.js";

export const batchesInOpenAlex = openAlexSchema.table("batch", {
  id: serial("id").primaryKey(),
  createdAt: timestamp("createdAt", { mode: "date" }),
  updatedAt: timestamp("updatedAt", { mode: "date" }),
});

export const workBatchesInOpenAlex = openAlexSchema.table("works_batch", {
  work_id: text("work_id")
    .references(() => worksInOpenalex.id, { onDelete: "set null" })
    .unique()
    .notNull(),
  batch_id: integer("batch_id")
    .references(() => batchesInOpenAlex.id, { onDelete: "set null" })
    .unique()
    .notNull(),
});
