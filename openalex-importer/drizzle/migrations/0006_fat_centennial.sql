ALTER TABLE "openalex"."works_best_oa_locations" DROP CONSTRAINT "works_best_oa_locations_work_id_pk";--> statement-breakpoint
ALTER TABLE "openalex"."works_best_oa_locations" ADD PRIMARY KEY ("work_id");--> statement-breakpoint
ALTER TABLE "openalex"."works_best_oa_locations" ALTER COLUMN "work_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "openalex"."batch" ADD COLUMN "started_at" timestamp DEFAULT now();--> statement-breakpoint
ALTER TABLE "openalex"."batch" ADD COLUMN "finished_at" timestamp;--> statement-breakpoint
ALTER TABLE "openalex"."batch" ADD COLUMN "query_type" text NOT NULL;--> statement-breakpoint
ALTER TABLE "openalex"."batch" ADD COLUMN "query_from" timestamp NOT NULL;--> statement-breakpoint
ALTER TABLE "openalex"."batch" ADD COLUMN "query_to" timestamp NOT NULL;--> statement-breakpoint
ALTER TABLE "openalex"."batch" DROP COLUMN "created_at";--> statement-breakpoint
ALTER TABLE "openalex"."batch" DROP COLUMN "updated_at";