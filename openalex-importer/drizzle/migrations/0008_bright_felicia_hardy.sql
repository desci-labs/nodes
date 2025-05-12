ALTER TABLE "openalex"."works_batch" DROP CONSTRAINT "works_batch_work_id_works_id_fk";
--> statement-breakpoint
DROP INDEX "openalex"."authors_counts_by_year_year_idx";--> statement-breakpoint
DROP INDEX "openalex"."authors_ids_openalex_idx";--> statement-breakpoint
DROP INDEX "openalex"."authors_ids_orcid_idx";--> statement-breakpoint
DROP INDEX "openalex"."concepts_descriptions_embeddings_idx";--> statement-breakpoint
DROP INDEX "openalex"."concepts_id_idx";--> statement-breakpoint
DROP INDEX "openalex"."concepts_name_embeddings_idx";--> statement-breakpoint
DROP INDEX "openalex"."concepts_ancestors_concept_id_idx";--> statement-breakpoint
DROP INDEX "openalex"."idx_concept_id";--> statement-breakpoint
DROP INDEX "openalex"."idx_concept_id_by_year";--> statement-breakpoint
DROP INDEX "openalex"."idx_concepts_counts";--> statement-breakpoint
DROP INDEX "openalex"."idx_concept_ids";--> statement-breakpoint
DROP INDEX "openalex"."concepts_related_concepts_concept_id_idx";--> statement-breakpoint
DROP INDEX "openalex"."concepts_related_concepts_related_concept_id_idx";--> statement-breakpoint
DROP INDEX "openalex"."institutions_id_idx";--> statement-breakpoint
DROP INDEX "openalex"."institutions_ror_idx";--> statement-breakpoint
DROP INDEX "openalex"."idx_institutions_id";--> statement-breakpoint
DROP INDEX "openalex"."idx_institution_year";--> statement-breakpoint
DROP INDEX "openalex"."idx_institutions_geo";--> statement-breakpoint
DROP INDEX "openalex"."idx_publishers_id";--> statement-breakpoint
DROP INDEX "openalex"."idx_publishers_counts";--> statement-breakpoint
DROP INDEX "openalex"."idx_publishers_ids_publisher_id";--> statement-breakpoint
DROP INDEX "openalex"."idx_source_id";--> statement-breakpoint
DROP INDEX "openalex"."idx_sources_counts";--> statement-breakpoint
DROP INDEX "openalex"."works_authorships_author_id_idx";--> statement-breakpoint
DROP INDEX "openalex"."works_authorships_work_id_idx";--> statement-breakpoint
DROP INDEX "openalex"."mesh_work_id_idx";--> statement-breakpoint
DROP INDEX "openalex"."referenced_works_referenced_work_id_idx";--> statement-breakpoint
DROP INDEX "openalex"."referenced_works_work_id_idx";--> statement-breakpoint
DROP INDEX "openalex"."related_works_work_id_idx";--> statement-breakpoint
DROP INDEX "openalex"."related_works_related_work_id_idx";--> statement-breakpoint
DROP INDEX "openalex"."topics_work_id_idx";--> statement-breakpoint
DROP INDEX "openalex"."topics_topic_id_idx";--> statement-breakpoint
DROP INDEX "openalex"."work_batches_work_id_idx";--> statement-breakpoint
DROP INDEX "openalex"."work_batches_batch_id_idx";--> statement-breakpoint
ALTER TABLE "openalex"."concepts" ADD PRIMARY KEY ("id");--> statement-breakpoint
ALTER TABLE "openalex"."concepts_counts_by_year" ALTER COLUMN "concept_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "openalex"."concepts_counts_by_year" ALTER COLUMN "year" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "openalex"."concepts_ids" ADD PRIMARY KEY ("concept_id");--> statement-breakpoint
ALTER TABLE "openalex"."institutions_counts_by_year" ALTER COLUMN "institution_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "openalex"."institutions_counts_by_year" ALTER COLUMN "year" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "openalex"."institutions_geo" ADD PRIMARY KEY ("institution_id");--> statement-breakpoint
ALTER TABLE "openalex"."institutions_ids" ADD PRIMARY KEY ("institution_id");--> statement-breakpoint
ALTER TABLE "openalex"."publishers" ADD PRIMARY KEY ("id");--> statement-breakpoint
ALTER TABLE "openalex"."publishers_ids" ADD PRIMARY KEY ("publisher_id");--> statement-breakpoint
ALTER TABLE "openalex"."publishers_ids" ALTER COLUMN "publisher_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "openalex"."sources_counts_by_year" ALTER COLUMN "source_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "openalex"."sources_counts_by_year" ALTER COLUMN "year" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "openalex"."sources_ids" ADD PRIMARY KEY ("source_id");--> statement-breakpoint
ALTER TABLE "openalex"."sources_ids" ALTER COLUMN "source_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "openalex"."concepts_counts_by_year" ADD CONSTRAINT "concepts_counts_by_year_concept_id_year_pk" PRIMARY KEY("concept_id","year");--> statement-breakpoint
ALTER TABLE "openalex"."concepts_related_concepts" ADD CONSTRAINT "concepts_related_concepts_concept_id_related_concept_id_pk" PRIMARY KEY("concept_id","related_concept_id");--> statement-breakpoint
ALTER TABLE "openalex"."institutions_associated_institutions" ADD CONSTRAINT "institutions_associated_institutions_institution_id_associated_institution_id_pk" PRIMARY KEY("institution_id","associated_institution_id");--> statement-breakpoint
ALTER TABLE "openalex"."institutions_counts_by_year" ADD CONSTRAINT "institutions_counts_by_year_institution_id_year_pk" PRIMARY KEY("institution_id","year");--> statement-breakpoint
ALTER TABLE "openalex"."publishers_counts_by_year" ADD CONSTRAINT "publishers_counts_by_year_publisher_id_year_pk" PRIMARY KEY("publisher_id","year");--> statement-breakpoint
ALTER TABLE "openalex"."sources_counts_by_year" ADD CONSTRAINT "sources_counts_by_year_source_id_year_pk" PRIMARY KEY("source_id","year");--> statement-breakpoint
ALTER TABLE "openalex"."works_batch" ADD CONSTRAINT "works_batch_work_id_works_id_fk" FOREIGN KEY ("work_id") REFERENCES "openalex"."works"("id") ON DELETE set null ON UPDATE cascade;
