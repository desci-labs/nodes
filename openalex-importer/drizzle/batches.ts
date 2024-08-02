import { serial, integer, text, timestamp } from "drizzle-orm/pg-core";
import { openalex as openAlexSchema, worksInOpenalex } from "./schema.js";

export const batch = openAlexSchema.table("batch", {
  id: serial("id").primaryKey(),
  createdAt: timestamp("createdAt", { mode: "date" }),
  updatedAt: timestamp("updatedAt", { mode: "date" }),
});

export const workBatch = openAlexSchema.table("works_batch", {
  work_id: text("work_id")
    .references(() => worksInOpenalex.id, { onDelete: "set null" })
    .unique()
    .notNull(),
  batch_id: integer("batch_id")
    .references(() => batch.id, { onDelete: "set null" })
    .unique()
    .notNull(),
});
