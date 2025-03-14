ALTER TABLE "openalex"."works_locations" ADD CONSTRAINT "works_locations_work_id_landing_page_url_pk" PRIMARY KEY("work_id","landing_page_url");--> statement-breakpoint
CREATE INDEX "locations_work_id_idx" ON "openalex"."works_locations" USING btree ("work_id");
