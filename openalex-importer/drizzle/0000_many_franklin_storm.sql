CREATE TABLE IF NOT EXISTS "openalex"."batch" (
	"id" serial PRIMARY KEY NOT NULL,
	"createdAt" timestamp,
	"updatedAt" timestamp
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "openalex"."works_batch" (
	"work_id" text NOT NULL,
	"batch_id" text NOT NULL,
	"createdAt" timestamp,
	"updatedAt" timestamp,
	CONSTRAINT "works_batch_work_id_unique" UNIQUE("work_id"),
	CONSTRAINT "works_batch_batch_id_unique" UNIQUE("batch_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "openalex"."works" (
	"id" text PRIMARY KEY NOT NULL,
	"doi" text,
	"title" text,
	"display_name" text,
	"publication_year" integer,
	"publication_date" date,
	"type" text,
	"cited_by_count" integer,
	"is_retracted" boolean,
	"is_paratext" boolean,
	"cited_by_api_url" text,
	"abstract_inverted_index" json,
	"language" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "openalex"."works_ids" (
	"work_id" text NOT NULL,
	"openalex" text,
	"doi" text,
	"mag" bigint,
	"pmid" text,
	"pmcid" text
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "openalex"."works_batch" ADD CONSTRAINT "works_batch_work_id_works_id_fk" FOREIGN KEY ("work_id") REFERENCES "openalex"."works"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "openalex"."works_batch" ADD CONSTRAINT "works_batch_batch_id_batch_id_fk" FOREIGN KEY ("batch_id") REFERENCES "openalex"."batch"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
