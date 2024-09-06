CREATE TABLE IF NOT EXISTS "openalex"."batch" (
	"id" serial PRIMARY KEY NOT NULL,
	"createdAt" timestamp,
	"updatedAt" timestamp
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "openalex"."works_batch" (
	"work_id" text NOT NULL,
	"batch_id" integer NOT NULL,
	CONSTRAINT "works_batch_work_id_unique" UNIQUE("work_id"),
	CONSTRAINT "works_batch_batch_id_unique" UNIQUE("batch_id")
);

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
--> statement-breakpoint
DROP SCHEMA "openalex";
