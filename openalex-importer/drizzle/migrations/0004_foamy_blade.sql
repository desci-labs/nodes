DROP INDEX "openalex"."best_oa_locations_work_id_idx";--> statement-breakpoint
DROP INDEX "openalex"."best_oa_locations_source_id_idx";--> statement-breakpoint
ALTER TABLE "openalex"."works_best_oa_locations" DROP CONSTRAINT "works_best_oa_locations_work_id_source_id_pk";--> statement-breakpoint
-- Manually added to drop implicit NOT NULL from part in composite PK
ALTER TABLE "openalex"."works_best_oa_locations" ALTER COLUMN source_id DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "openalex"."works_best_oa_locations" ADD CONSTRAINT "works_best_oa_locations_work_id_pk" PRIMARY KEY("work_id");
