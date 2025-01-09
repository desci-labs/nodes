CREATE EXTENSION
IF NOT EXISTS vector;

-- DROP SCHEMA openalex;

CREATE SCHEMA openalex AUTHORIZATION postgres;

-- Drop table

-- DROP TABLE openalex.authors;

CREATE TABLE openalex.authors
(
  id text NOT NULL,
  orcid text NULL,
  display_name text NULL,
  display_name_alternatives json NULL,
  works_count int4 NULL,
  cited_by_count int4 NULL,
  last_known_institution text NULL,
  works_api_url text NULL,
  updated_date timestamp NULL,
  CONSTRAINT authors_pkey PRIMARY KEY (id)
);

-- Drop table

-- DROP TABLE openalex.authors_counts_by_year;

CREATE TABLE openalex.authors_counts_by_year
(
  author_id text NOT NULL,
  "year" int4 NOT NULL,
  works_count int4 NULL,
  cited_by_count int4 NULL,
  oa_works_count int4 NULL,
  CONSTRAINT authors_counts_by_year_pkey PRIMARY KEY (author_id, year)
);

-- Drop table

-- DROP TABLE openalex.authors_ids;

CREATE TABLE openalex.authors_ids
(
  author_id text NOT NULL,
  openalex text NULL,
  orcid text NULL,
  scopus text NULL,
  twitter text NULL,
  wikipedia text NULL,
  mag int8 NULL
);

-- Drop table

-- DROP TABLE openalex.concepts;

CREATE TABLE openalex.concepts
(
  id text NOT NULL,
  wikidata text NULL,
  display_name text NULL,
  "level" int4 NULL,
  description text NULL,
  works_count int4 NULL,
  cited_by_count int4 NULL,
  image_url text NULL,
  image_thumbnail_url text NULL,
  works_api_url text NULL,
  updated_date timestamp NULL,

descriptions_embeddings vector
(768) NULL,
  name_embeddings vector
(768) NULL,
  CONSTRAINT concepts_pkey PRIMARY KEY (id)
);
CREATE INDEX concepts_descriptions_embeddings_idx ON openalex.concepts USING ivfflat
(descriptions_embeddings)
WITH
(lists='100');
CREATE INDEX concepts_name_embeddings_idx ON openalex.concepts USING ivfflat
(name_embeddings)
WITH
(lists='100');

-- Drop table

-- DROP TABLE openalex.concepts_ancestors;

CREATE TABLE openalex.concepts_ancestors
(
  concept_id text NULL,
  ancestor_id text NULL
);
CREATE INDEX concepts_ancestors_concept_id_idx ON openalex.concepts_ancestors USING btree
(concept_id);

-- Drop table

-- DROP TABLE openalex.concepts_counts_by_year;

CREATE TABLE openalex.concepts_counts_by_year
(
  concept_id text NOT NULL,
  "year" int4 NOT NULL,
  works_count int4 NULL,
  cited_by_count int4 NULL,
  oa_works_count int4 NULL,
  CONSTRAINT concepts_counts_by_year_pkey PRIMARY KEY (concept_id, year)
);

-- Drop table

-- DROP TABLE openalex.concepts_ids;

CREATE TABLE openalex.concepts_ids
(
  concept_id text NOT NULL,
  openalex text NULL,
  wikidata text NULL,
  wikipedia text NULL,
  umls_aui json NULL,
  umls_cui json NULL,
  mag int8 NULL,
  CONSTRAINT concepts_ids_pkey PRIMARY KEY (concept_id)
);

-- Drop table

-- DROP TABLE openalex.concepts_related_concepts;

CREATE TABLE openalex.concepts_related_concepts
(
  concept_id text NULL,
  related_concept_id text NULL,
  score float4 NULL
);
CREATE INDEX concepts_related_concepts_concept_id_idx ON openalex.concepts_related_concepts USING btree
(concept_id);
CREATE INDEX concepts_related_concepts_related_concept_id_idx ON openalex.concepts_related_concepts USING btree
(related_concept_id);

-- Drop table

-- DROP TABLE openalex.institutions;

CREATE TABLE openalex.institutions
(
  id text NOT NULL,
  ror text NULL,
  display_name text NULL,
  country_code text NULL,
  "type" text NULL,
  homepage_url text NULL,
  image_url text NULL,
  image_thumbnail_url text NULL,
  display_name_acronyms json NULL,
  display_name_alternatives json NULL,
  works_count int4 NULL,
  cited_by_count int4 NULL,
  works_api_url text NULL,
  updated_date timestamp NULL,
  CONSTRAINT institutions_pkey PRIMARY KEY (id)
);

-- Drop table

-- DROP TABLE openalex.institutions_associated_institutions;

CREATE TABLE openalex.institutions_associated_institutions
(
  institution_id text NULL,
  associated_institution_id text NULL,
  relationship text NULL
);

-- Drop table

-- DROP TABLE openalex.institutions_counts_by_year;

CREATE TABLE openalex.institutions_counts_by_year
(
  institution_id text NOT NULL,
  "year" int4 NOT NULL,
  works_count int4 NULL,
  cited_by_count int4 NULL,
  oa_works_count int4 NULL,
  CONSTRAINT institutions_counts_by_year_pkey PRIMARY KEY (institution_id, year)
);

-- Drop table

-- DROP TABLE openalex.institutions_geo;

CREATE TABLE openalex.institutions_geo
(
  institution_id text NOT NULL,
  city text NULL,
  geonames_city_id text NULL,
  region text NULL,
  country_code text NULL,
  country text NULL,
  latitude float4 NULL,
  longitude float4 NULL,
  CONSTRAINT institutions_geo_pkey PRIMARY KEY (institution_id)
);

-- Drop table

-- DROP TABLE openalex.institutions_ids;

CREATE TABLE openalex.institutions_ids
(
  institution_id text NOT NULL,
  openalex text NULL,
  ror text NULL,
  grid text NULL,
  wikipedia text NULL,
  wikidata text NULL,
  mag int8 NULL,
  CONSTRAINT institutions_ids_pkey PRIMARY KEY (institution_id)
);

-- Drop table

-- DROP TABLE openalex.publishers;

CREATE TABLE openalex.publishers
(
  id text NOT NULL,
  display_name text NULL,
  alternate_titles json NULL,
  country_codes json NULL,
  hierarchy_level int4 NULL,
  parent_publisher text NULL,
  works_count int4 NULL,
  cited_by_count int4 NULL,
  sources_api_url text NULL,
  updated_date timestamp NULL
);

-- Drop table

-- DROP TABLE openalex.publishers_counts_by_year;

CREATE TABLE openalex.publishers_counts_by_year
(
  publisher_id text NOT NULL,
  "year" int4 NOT NULL,
  works_count int4 NULL,
  cited_by_count int4 NULL,
  oa_works_count int4 NULL
);

-- Drop table

-- DROP TABLE openalex.publishers_ids;

CREATE TABLE openalex.publishers_ids
(
  publisher_id text NULL,
  openalex text NULL,
  ror text NULL,
  wikidata text NULL
);

-- Drop table

-- DROP TABLE openalex.sources;

CREATE TABLE openalex.sources
(
  id text NOT NULL,
  issn_l text NULL,
  issn json NULL,
  display_name text NULL,
  publisher text NULL,
  works_count int4 NULL,
  cited_by_count int4 NULL,
  is_oa bool NULL,
  is_in_doaj bool NULL,
  homepage_url text NULL,
  works_api_url text NULL,
  updated_date timestamp NULL,
  CONSTRAINT sources_pkey PRIMARY KEY (id)
);

-- Drop table

-- DROP TABLE openalex.sources_counts_by_year;

CREATE TABLE openalex.sources_counts_by_year
(
  source_id text NOT NULL,
  "year" int4 NOT NULL,
  works_count int4 NULL,
  cited_by_count int4 NULL,
  oa_works_count int4 NULL,
  CONSTRAINT sources_counts_by_year_pkey PRIMARY KEY (source_id, year)
);

-- Drop table

-- DROP TABLE openalex.sources_ids;

CREATE TABLE openalex.sources_ids
(
  source_id text NULL,
  openalex text NULL,
  issn_l text NULL,
  issn json NULL,
  mag int8 NULL,
  wikidata text NULL,
  fatcat text NULL
);

-- Drop table

-- DROP TABLE openalex.topics;

CREATE TABLE openalex.topics
(
  id text NOT NULL,
  display_name text NULL,
  subfield_id text NULL,
  subfield_display_name text NULL,
  field_id text NULL,
  field_display_name text NULL,
  domain_id text NULL,
  domain_display_name text NULL,
  description text NULL,
  keywords text NULL,
  works_api_url text NULL,
  wikipedia_id text NULL,
  works_count int4 NULL,
  cited_by_count int4 NULL,
  updated_date timestamp NULL
);

-- Drop table

-- DROP TABLE openalex.works;

CREATE TABLE openalex.works
(
  id text NOT NULL,
  doi text NULL,
  title text NULL,
  display_name text NULL,
  publication_year int4 NULL,
  publication_date text NULL,
  "type" text NULL,
  cited_by_count int4 NULL,
  is_retracted bool NULL,
  is_paratext bool NULL,
  cited_by_api_url text NULL,
  abstract_inverted_index json NULL,
  "language" text NULL,
  publication_date_date date NULL,
  CONSTRAINT works_pkey PRIMARY KEY (id)
);
CREATE INDEX works_publication_date_idx ON openalex.works USING btree
(publication_date);

-- Drop table

-- DROP TABLE openalex.works_authorships;

CREATE TABLE openalex.works_authorships
(
  work_id text NULL,
  author_position text NULL,
  author_id text NULL,
  institution_id text NULL,
  raw_affiliation_string text NULL
);
CREATE INDEX works_authorships_author_id_idx ON openalex.works_authorships USING btree
(author_id);
CREATE INDEX works_authorships_institution_id_idx ON openalex.works_authorships USING btree
(institution_id);
CREATE INDEX works_authorships_work_id_idx ON openalex.works_authorships USING btree
(work_id);

-- Drop table

-- DROP TABLE openalex.works_best_oa_locations;

CREATE TABLE openalex.works_best_oa_locations
(
  work_id text NULL,
  source_id text NULL,
  landing_page_url text NULL,
  pdf_url text NULL,
  is_oa bool NULL,
  "version" text NULL,
  license text NULL
);
CREATE INDEX works_best_oa_locations_work_id_idx ON openalex.works_best_oa_locations USING btree
(work_id);

-- Drop table

-- DROP TABLE openalex.works_biblio;

CREATE TABLE openalex.works_biblio
(
  work_id text NOT NULL,
  volume text NULL,
  issue text NULL,
  first_page text NULL,
  last_page text NULL,
  CONSTRAINT works_biblio_pkey PRIMARY KEY (work_id)
);

-- Drop table

-- DROP TABLE openalex.works_concepts;

CREATE TABLE openalex.works_concepts
(
  work_id text NULL,
  concept_id text NULL,
  score float4 NULL
);
CREATE INDEX works_concepts_concept_id_idx ON openalex.works_concepts USING btree
(concept_id);
CREATE INDEX works_concepts_work_id_idx ON openalex.works_concepts USING btree
(work_id);

-- Drop table

-- DROP TABLE openalex.works_ids;

CREATE TABLE openalex.works_ids
(
  work_id text NOT NULL,
  openalex text NULL,
  doi text NULL,
  mag int8 NULL,
  pmid text NULL,
  pmcid text NULL
);

-- Drop table

-- DROP TABLE openalex.works_locations;

CREATE TABLE openalex.works_locations
(
  work_id text NULL,
  source_id text NULL,
  landing_page_url text NULL,
  pdf_url text NULL,
  is_oa bool NULL,
  "version" text NULL,
  license text NULL
);
CREATE INDEX works_locations_work_id_idx ON openalex.works_locations USING btree
(work_id);

-- Drop table

-- DROP TABLE openalex.works_mesh;

CREATE TABLE openalex.works_mesh
(
  work_id text NULL,
  descriptor_ui text NULL,
  descriptor_name text NULL,
  qualifier_ui text NULL,
  qualifier_name text NULL,
  is_major_topic bool NULL
);
CREATE INDEX works_mesh_descriptor_ui_idx ON openalex.works_mesh USING btree
(descriptor_ui);
CREATE INDEX works_mesh_qualifier_ui_idx ON openalex.works_mesh USING btree
(qualifier_ui);
CREATE INDEX works_mesh_work_id_idx ON openalex.works_mesh USING btree
(work_id);

-- Drop table

-- DROP TABLE openalex.works_open_access;

CREATE TABLE openalex.works_open_access
(
  work_id text NOT NULL,
  is_oa bool NULL,
  oa_status text NULL,
  oa_url text NULL,
  any_repository_has_fulltext bool NULL
);
CREATE INDEX works_open_access_work_id_idx ON openalex.works_open_access USING btree
(work_id);
CREATE INDEX works_open_access_work_id_idx1 ON openalex.works_open_access USING btree
(work_id);

-- Drop table

-- DROP TABLE openalex.works_primary_locations;

CREATE TABLE openalex.works_primary_locations
(
  work_id text NULL,
  source_id text NULL,
  landing_page_url text NULL,
  pdf_url text NULL,
  is_oa bool NULL,
  "version" text NULL,
  license text NULL
);
CREATE INDEX works_primary_locations_work_id_idx ON openalex.works_primary_locations USING btree
(work_id);

-- Drop table

-- DROP TABLE openalex.works_referenced_works;

CREATE TABLE openalex.works_referenced_works
(
  work_id text NULL,
  referenced_work_id text NULL
);
CREATE INDEX works_referenced_works_referenced_work_id_idx ON openalex.works_referenced_works USING btree
(referenced_work_id);
CREATE INDEX works_referenced_works_work_id_idx ON openalex.works_referenced_works USING btree
(work_id);

-- Drop table

-- DROP TABLE openalex.works_related_works;

CREATE TABLE openalex.works_related_works
(
  work_id text NULL,
  related_work_id text NULL
);
CREATE INDEX works_related_works_related_work_id_idx ON openalex.works_related_works USING btree
(related_work_id);
CREATE INDEX works_related_works_work_id_idx ON openalex.works_related_works USING btree
(work_id);

-- Drop table

-- DROP TABLE openalex.works_topics;

CREATE TABLE openalex.works_topics
(
  work_id text NULL,
  topic_id text NULL,
  score float4 NULL
);
CREATE INDEX works_topics_topic_id_idx ON openalex.works_topics USING btree
(topic_id);
CREATE INDEX works_topics_work_id_idx ON openalex.works_topics USING btree
(work_id);


-- CreateTable
CREATE TABLE openalex."batch"
(
  "id" SERIAL NOT NULL,
  "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "batch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE openalex."works_batch"
(
  "work_id" TEXT NOT NULL,
  "batch_id" INTEGER NOT NULL,

  CONSTRAINT "works_batch_pkey" PRIMARY KEY ("work_id")
);


-- AddForeignKey
ALTER TABLE openalex."works_batch" ADD CONSTRAINT "works_batch_work_id_fkey" FOREIGN KEY ("work_id") REFERENCES openalex."works"("id")
ON DELETE RESTRICT ON
UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE openalex."works_batch" ADD CONSTRAINT "works_batch_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES openalex."batch"("id")
ON DELETE RESTRICT ON
UPDATE CASCADE;

