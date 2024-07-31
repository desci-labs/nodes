import {
  pgTable,
  serial,
  boolean,
  numeric,
  integer,
  json,
  text,
  timestamp,
  date,
  bigint,
  pgSchema,
} from "drizzle-orm/pg-core";
// import { createInsertSchema } from "drizzle-zod";
// import z from "zod";

const openAlexSchema = pgSchema("openalex");

export const works = openAlexSchema.table("works", {
  id: text("id").primaryKey(),
  doi: text("doi"),
  title: text("title"),
  display_name: text("display_name"),
  publication_year: integer("publication_year"),
  publication_date: date("publication_date"),
  type: text("type"),
  cited_by_count: integer("cited_by_count"),
  is_retracted: boolean("is_retracted"),
  is_paratext: boolean("is_paratext"),
  cited_by_api_url: text("cited_by_api_url"),
  abstract_inverted_index: json("abstract_inverted_index"),
  language: text("language"),
  publication_date_date: date("publication_date_date"),
});

export const batch = openAlexSchema.table("batch", {
  id: serial("id").primaryKey(),
  createdAt: timestamp("createdAt", { mode: "date" }),
  updatedAt: timestamp("updatedAt", { mode: "date" }),
});

export const workBatch = openAlexSchema.table("works_batch", {
  work_id: text("work_id")
    .references(() => works.id, { onDelete: "set null" })
    .unique()
    .notNull(),
  batch_id: integer("batch_id")
    .references(() => batch.id, { onDelete: "set null" })
    .unique()
    .notNull(),
  // createdAt: timestamp("createdAt", { mode: "date" }),
  // updatedAt: timestamp("updatedAt", { mode: "date" }),
});

export const worksId = openAlexSchema.table("works_ids", {
  work_id: text("work_id").notNull(),
  openalex: text("openalex"),
  doi: text("doi"),
  mag: bigint("mag", { mode: "bigint" }),
  pmid: text("pmid"),
  pmcid: text("pmcid"),
});
