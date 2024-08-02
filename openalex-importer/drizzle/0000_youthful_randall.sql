-- Current sql file was generated after introspecting the database
-- If you want to run this migration please uncomment this code before executing migrations
/*
CREATE SCHEMA "openalex";
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "openalex"."institutions_geo" (
	"institution_id" text NOT NULL,
	"city" text,
	"geonames_city_id" text,
	"region" text,
	"country_code" text,
	"country" text,
	"latitude" real,
	"longitude" real
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "openalex"."institutions_ids" (
	"institution_id" text NOT NULL,
	"openalex" text,
	"ror" text,
	"grid" text,
	"wikipedia" text,
	"wikidata" text,
	"mag" bigint
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "openalex"."publishers" (
	"id" text NOT NULL,
	"display_name" text,
	"alternate_titles" json,
	"country_codes" json,
	"hierarchy_level" integer,
	"parent_publisher" text,
	"works_count" integer,
	"cited_by_count" integer,
	"sources_api_url" text,
	"updated_date" timestamp
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "openalex"."publishers_counts_by_year" (
	"publisher_id" text NOT NULL,
	"year" integer NOT NULL,
	"works_count" integer,
	"cited_by_count" integer,
	"oa_works_count" integer
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "openalex"."publishers_ids" (
	"publisher_id" text,
	"openalex" text,
	"ror" text,
	"wikidata" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "openalex"."institutions_associated_institutions" (
	"institution_id" text,
	"associated_institution_id" text,
	"relationship" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "openalex"."works_primary_locations" (
	"work_id" text,
	"source_id" text,
	"landing_page_url" text,
	"pdf_url" text,
	"is_oa" boolean,
	"version" text,
	"license" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "openalex"."works" (
	"id" text NOT NULL,
	"doi" text,
	"title" text,
	"display_name" text,
	"publication_year" integer,
	"publication_date" text,
	"type" text,
	"cited_by_count" integer,
	"is_retracted" boolean,
	"is_paratext" boolean,
	"cited_by_api_url" text,
	"abstract_inverted_index" json,
	"language" text,
	"publication_date_date" date
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "openalex"."institutions" (
	"id" text NOT NULL,
	"ror" text,
	"display_name" text,
	"country_code" text,
	"type" text,
	"homepage_url" text,
	"image_url" text,
	"image_thumbnail_url" text,
	"display_name_acronyms" json,
	"display_name_alternatives" json,
	"works_count" integer,
	"cited_by_count" integer,
	"works_api_url" text,
	"updated_date" timestamp
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "openalex"."institutions_counts_by_year" (
	"institution_id" text NOT NULL,
	"year" integer NOT NULL,
	"works_count" integer,
	"cited_by_count" integer,
	"oa_works_count" integer
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "openalex"."sources" (
	"id" text NOT NULL,
	"issn_l" text,
	"issn" json,
	"display_name" text,
	"publisher" text,
	"works_count" integer,
	"cited_by_count" integer,
	"is_oa" boolean,
	"is_in_doaj" boolean,
	"homepage_url" text,
	"works_api_url" text,
	"updated_date" timestamp
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "openalex"."sources_counts_by_year" (
	"source_id" text NOT NULL,
	"year" integer NOT NULL,
	"works_count" integer,
	"cited_by_count" integer,
	"oa_works_count" integer
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "openalex"."works_biblio" (
	"work_id" text NOT NULL,
	"volume" text,
	"issue" text,
	"first_page" text,
	"last_page" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "openalex"."works_concepts" (
	"work_id" text,
	"concept_id" text,
	"score" real
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
CREATE TABLE IF NOT EXISTS "openalex"."works_mesh" (
	"work_id" text,
	"descriptor_ui" text,
	"descriptor_name" text,
	"qualifier_ui" text,
	"qualifier_name" text,
	"is_major_topic" boolean
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "openalex"."works_open_access" (
	"work_id" text NOT NULL,
	"is_oa" boolean,
	"oa_status" text,
	"oa_url" text,
	"any_repository_has_fulltext" boolean
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "openalex"."sources_ids" (
	"source_id" text,
	"openalex" text,
	"issn_l" text,
	"issn" json,
	"mag" bigint,
	"wikidata" text,
	"fatcat" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "openalex"."works_locations" (
	"work_id" text,
	"source_id" text,
	"landing_page_url" text,
	"pdf_url" text,
	"is_oa" boolean,
	"version" text,
	"license" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "openalex"."works_referenced_works" (
	"work_id" text,
	"referenced_work_id" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "openalex"."works_related_works" (
	"work_id" text,
	"related_work_id" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "openalex"."works_topics" (
	"work_id" text,
	"topic_id" text,
	"score" real
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "openalex"."authors" (
	"id" text NOT NULL,
	"orcid" text,
	"display_name" text,
	"display_name_alternatives" json,
	"works_count" integer,
	"cited_by_count" integer,
	"last_known_institution" text,
	"works_api_url" text,
	"updated_date" timestamp
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "openalex"."authors_counts_by_year" (
	"author_id" text NOT NULL,
	"year" integer NOT NULL,
	"works_count" integer,
	"cited_by_count" integer,
	"oa_works_count" integer
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "openalex"."authors_ids" (
	"author_id" text NOT NULL,
	"openalex" text,
	"orcid" text,
	"scopus" text,
	"twitter" text,
	"wikipedia" text,
	"mag" bigint
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "openalex"."topics" (
	"id" text NOT NULL,
	"display_name" text,
	"subfield_id" text,
	"subfield_display_name" text,
	"field_id" text,
	"field_display_name" text,
	"domain_id" text,
	"domain_display_name" text,
	"description" text,
	"keywords" text,
	"works_api_url" text,
	"wikipedia_id" text,
	"works_count" integer,
	"cited_by_count" integer,
	"updated_date" timestamp
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "openalex"."concepts" (
	"id" text NOT NULL,
	"wikidata" text,
	"display_name" text,
	"level" integer,
	"description" text,
	"works_count" integer,
	"cited_by_count" integer,
	"image_url" text,
	"image_thumbnail_url" text,
	"works_api_url" text,
	"updated_date" timestamp,
	"descriptions_embeddings" vector(768),
	"name_embeddings" vector(768)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "openalex"."concepts_ancestors" (
	"concept_id" text,
	"ancestor_id" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "openalex"."concepts_counts_by_year" (
	"concept_id" text NOT NULL,
	"year" integer NOT NULL,
	"works_count" integer,
	"cited_by_count" integer,
	"oa_works_count" integer
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "openalex"."works_authorships" (
	"work_id" text,
	"author_position" text,
	"author_id" text,
	"institution_id" text,
	"raw_affiliation_string" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "openalex"."works_best_oa_locations" (
	"work_id" text,
	"source_id" text,
	"landing_page_url" text,
	"pdf_url" text,
	"is_oa" boolean,
	"version" text,
	"license" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "openalex"."concepts_ids" (
	"concept_id" text NOT NULL,
	"openalex" text,
	"wikidata" text,
	"wikipedia" text,
	"umls_aui" json,
	"umls_cui" json,
	"mag" bigint
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "openalex"."concepts_related_concepts" (
	"concept_id" text,
	"related_concept_id" text,
	"score" real
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "works_primary_locations_work_id_idx" ON "openalex"."works_primary_locations" USING btree ("work_id" text_ops);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "works_publication_date_idx" ON "openalex"."works" USING btree ("publication_date" text_ops);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "works_concepts_concept_id_idx" ON "openalex"."works_concepts" USING btree ("concept_id" text_ops);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "works_concepts_work_id_idx" ON "openalex"."works_concepts" USING btree ("work_id" text_ops);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "works_mesh_descriptor_ui_idx" ON "openalex"."works_mesh" USING btree ("descriptor_ui" text_ops);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "works_mesh_qualifier_ui_idx" ON "openalex"."works_mesh" USING btree ("qualifier_ui" text_ops);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "works_mesh_work_id_idx" ON "openalex"."works_mesh" USING btree ("work_id" text_ops);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "works_open_access_work_id_idx" ON "openalex"."works_open_access" USING btree ("work_id" text_ops);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "works_open_access_work_id_idx1" ON "openalex"."works_open_access" USING btree ("work_id" text_ops);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "works_locations_work_id_idx" ON "openalex"."works_locations" USING btree ("work_id" text_ops);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "works_referenced_works_referenced_work_id_idx" ON "openalex"."works_referenced_works" USING btree ("referenced_work_id" text_ops);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "works_referenced_works_work_id_idx" ON "openalex"."works_referenced_works" USING btree ("work_id" text_ops);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "works_related_works_related_work_id_idx" ON "openalex"."works_related_works" USING btree ("related_work_id" text_ops);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "works_related_works_work_id_idx" ON "openalex"."works_related_works" USING btree ("work_id" text_ops);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "works_topics_topic_id_idx" ON "openalex"."works_topics" USING btree ("topic_id" text_ops);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "works_topics_work_id_idx" ON "openalex"."works_topics" USING btree ("work_id" text_ops);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "concepts_descriptions_embeddings_idx" ON "openalex"."concepts" USING ivfflat ("descriptions_embeddings" vector_l2_ops) WITH (lists=100);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "concepts_name_embeddings_idx" ON "openalex"."concepts" USING ivfflat ("name_embeddings" vector_l2_ops) WITH (lists=100);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "concepts_ancestors_concept_id_idx" ON "openalex"."concepts_ancestors" USING btree ("concept_id" text_ops);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "works_authorships_author_id_idx" ON "openalex"."works_authorships" USING btree ("author_id" text_ops);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "works_authorships_institution_id_idx" ON "openalex"."works_authorships" USING btree ("institution_id" text_ops);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "works_authorships_work_id_idx" ON "openalex"."works_authorships" USING btree ("work_id" text_ops);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "works_best_oa_locations_work_id_idx" ON "openalex"."works_best_oa_locations" USING btree ("work_id" text_ops);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "concepts_related_concepts_concept_id_idx" ON "openalex"."concepts_related_concepts" USING btree ("concept_id" text_ops);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "concepts_related_concepts_related_concept_id_idx" ON "openalex"."concepts_related_concepts" USING btree ("related_concept_id" text_ops);
*/