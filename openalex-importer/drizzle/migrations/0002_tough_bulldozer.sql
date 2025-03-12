CREATE TABLE "openalex"."batch" (
	"id" serial PRIMARY KEY NOT NULL,
	"createdAt" timestamp,
	"updatedAt" timestamp
);
--> statement-breakpoint
CREATE TABLE "openalex"."works_batch" (
	"work_id" text NOT NULL,
	"batch_id" integer NOT NULL,
	CONSTRAINT "works_batch_work_id_unique" UNIQUE("work_id"),
	CONSTRAINT "works_batch_batch_id_unique" UNIQUE("batch_id")
);
--> statement-breakpoint
ALTER TABLE "openalex"."works_batch" ADD CONSTRAINT "works_batch_work_id_works_id_fk" FOREIGN KEY ("work_id") REFERENCES "openalex"."works"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "openalex"."works_batch" ADD CONSTRAINT "works_batch_batch_id_batch_id_fk" FOREIGN KEY ("batch_id") REFERENCES "openalex"."batch"("id") ON DELETE set null ON UPDATE no action;