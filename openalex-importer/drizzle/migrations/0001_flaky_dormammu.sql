DROP INDEX "openalex"."authors_id_idx";--> statement-breakpoint
DROP INDEX "openalex"."authors_counts_by_year_author_id_idx";--> statement-breakpoint
DROP INDEX "openalex"."authors_ids_author_id_idx";--> statement-breakpoint
DROP INDEX "openalex"."sources_id_idx";--> statement-breakpoint
DROP INDEX "openalex"."topics_id_idx";--> statement-breakpoint
DROP INDEX "openalex"."works_doi_idx";--> statement-breakpoint
DROP INDEX "openalex"."works_id_idx";--> statement-breakpoint
DROP INDEX "openalex"."works_publication_year_idx";--> statement-breakpoint
DROP INDEX "openalex"."works_best_oa_locations_work_id_idx";--> statement-breakpoint
DROP INDEX "openalex"."works_biblio_work_id_idx";--> statement-breakpoint
DROP INDEX "openalex"."works_concepts_concept_id_idx";--> statement-breakpoint
DROP INDEX "openalex"."works_concepts_work_id_idx";--> statement-breakpoint
DROP INDEX "openalex"."idx_works_ids_work_id";--> statement-breakpoint
DROP INDEX "openalex"."works_locations_work_id_idx";--> statement-breakpoint
DROP INDEX "openalex"."works_open_access_work_id_idx";--> statement-breakpoint
DROP INDEX "openalex"."works_open_access_work_id_idx1";--> statement-breakpoint
DROP INDEX "openalex"."works_primary_locations_work_id_idx";--> statement-breakpoint
DROP INDEX "openalex"."idx_referenced_work_id";--> statement-breakpoint
DROP INDEX "openalex"."idx_referenced_works_work_id";--> statement-breakpoint
DROP INDEX "openalex"."idx_works_related_related_work_id";--> statement-breakpoint
DROP INDEX "openalex"."works_topics_topic_id_idx";--> statement-breakpoint
DROP INDEX "openalex"."works_topics_work_id_idx";--> statement-breakpoint
DROP INDEX "openalex"."authors_ids_openalex_idx";--> statement-breakpoint
DROP INDEX "openalex"."authors_ids_orcid_idx";--> statement-breakpoint
DROP INDEX "openalex"."works_authorships_author_id_idx";--> statement-breakpoint
DROP INDEX "openalex"."works_authorships_work_id_idx";--> statement-breakpoint
DROP INDEX "openalex"."works_open_access_is_oa_idx";--> statement-breakpoint
ALTER TABLE "openalex"."authors" ADD PRIMARY KEY ("id");--> statement-breakpoint
ALTER TABLE "openalex"."authors_ids" ADD PRIMARY KEY ("author_id");--> statement-breakpoint
ALTER TABLE "openalex"."institutions" ADD PRIMARY KEY ("id");--> statement-breakpoint
ALTER TABLE "openalex"."sources" ADD PRIMARY KEY ("id");--> statement-breakpoint
ALTER TABLE "openalex"."topics" ADD PRIMARY KEY ("id");--> statement-breakpoint
ALTER TABLE "openalex"."works" ADD PRIMARY KEY ("id");--> statement-breakpoint
ALTER TABLE "openalex"."works_biblio" ADD PRIMARY KEY ("work_id");--> statement-breakpoint
ALTER TABLE "openalex"."works_ids" ADD PRIMARY KEY ("work_id");--> statement-breakpoint
ALTER TABLE "openalex"."works_open_access" ADD PRIMARY KEY ("work_id");--> statement-breakpoint
ALTER TABLE "openalex"."works_primary_locations" ADD PRIMARY KEY ("work_id");--> statement-breakpoint
ALTER TABLE "openalex"."works_primary_locations" ALTER COLUMN "work_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "openalex"."authors_counts_by_year" ADD CONSTRAINT "authors_counts_by_year_author_id_year_pk" PRIMARY KEY("author_id","year");--> statement-breakpoint
ALTER TABLE "openalex"."works_authorships" ADD CONSTRAINT "works_authorships_work_id_author_id_pk" PRIMARY KEY("work_id","author_id");--> statement-breakpoint
ALTER TABLE "openalex"."works_best_oa_locations" ADD CONSTRAINT "works_best_oa_locations_work_id_source_id_pk" PRIMARY KEY("work_id","source_id");--> statement-breakpoint
ALTER TABLE "openalex"."works_concepts" ADD CONSTRAINT "works_concepts_concept_id_work_id_pk" PRIMARY KEY("concept_id","work_id");--> statement-breakpoint
ALTER TABLE "openalex"."works_mesh" ADD CONSTRAINT "works_mesh_work_id_descriptor_ui_qualifier_ui_pk" PRIMARY KEY("work_id","descriptor_ui","qualifier_ui");--> statement-breakpoint
ALTER TABLE "openalex"."works_referenced_works" ADD CONSTRAINT "works_referenced_works_work_id_referenced_work_id_pk" PRIMARY KEY("work_id","referenced_work_id");--> statement-breakpoint
ALTER TABLE "openalex"."works_related_works" ADD CONSTRAINT "works_related_works_work_id_related_work_id_pk" PRIMARY KEY("work_id","related_work_id");--> statement-breakpoint
ALTER TABLE "openalex"."works_topics" ADD CONSTRAINT "works_topics_work_id_topic_id_pk" PRIMARY KEY("work_id","topic_id");--> statement-breakpoint
CREATE INDEX "authors_counts_by_year_year_idx" ON "openalex"."authors_counts_by_year" USING btree ("year");--> statement-breakpoint
CREATE INDEX "best_oa_locations_work_id_idx" ON "openalex"."works_best_oa_locations" USING btree ("work_id");--> statement-breakpoint
CREATE INDEX "best_oa_locations_source_id_idx" ON "openalex"."works_best_oa_locations" USING btree ("source_id");--> statement-breakpoint
CREATE INDEX "mesh_work_id_idx" ON "openalex"."works_mesh" USING btree ("work_id");--> statement-breakpoint
CREATE INDEX "referenced_works_referenced_work_id_idx" ON "openalex"."works_referenced_works" USING btree ("referenced_work_id");--> statement-breakpoint
CREATE INDEX "referenced_works_work_id_idx" ON "openalex"."works_referenced_works" USING btree ("work_id");--> statement-breakpoint
CREATE INDEX "related_works_work_id_idx" ON "openalex"."works_related_works" USING btree ("work_id");--> statement-breakpoint
CREATE INDEX "related_works_related_work_id_idx" ON "openalex"."works_related_works" USING btree ("related_work_id");--> statement-breakpoint
CREATE INDEX "topics_work_id_idx" ON "openalex"."works_topics" USING btree ("work_id");--> statement-breakpoint
CREATE INDEX "topics_topic_id_idx" ON "openalex"."works_topics" USING btree ("topic_id");--> statement-breakpoint
CREATE INDEX "authors_ids_openalex_idx" ON "openalex"."authors_ids" USING btree ("openalex");--> statement-breakpoint
CREATE INDEX "authors_ids_orcid_idx" ON "openalex"."authors_ids" USING btree ("orcid");--> statement-breakpoint
CREATE INDEX "works_authorships_author_id_idx" ON "openalex"."works_authorships" USING btree ("author_id");--> statement-breakpoint
CREATE INDEX "works_authorships_work_id_idx" ON "openalex"."works_authorships" USING btree ("work_id");--> statement-breakpoint
CREATE INDEX "works_open_access_is_oa_idx" ON "openalex"."works_open_access" USING btree ("is_oa");
