ALTER TABLE "openalex"."works_locations" DROP CONSTRAINT "works_locations_work_id_landing_page_url_pk";--> statement-breakpoint
ALTER TABLE "openalex"."works_locations" ALTER COLUMN landing_page_url DROP NOT NULL;
