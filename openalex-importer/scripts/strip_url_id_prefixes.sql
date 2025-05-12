-- Drop the largest indexes
ALTER TABLE openalex.works_referenced_works DROP CONSTRAINT works_referenced_works_work_id_referenced_work_id_pk;

ALTER TABLE openalex.works_related_works DROP CONSTRAINT works_related_works_work_id_related_work_id_pk;

ALTER TABLE openalex.works_concepts DROP CONSTRAINT works_concepts_concept_id_work_id_pk;

ALTER TABLE openalex.authors DROP CONSTRAINT authors_pkey;

ALTER TABLE openalex.authors_ids DROP CONSTRAINT authors_ids_pkey;

ALTER TABLE openalex.works_ids DROP CONSTRAINT works_ids_pkey;

DROP INDEX locations_work_id_idx ON openalex.works_locations;

ALTER TABLE openalex.works_mesh DROP CONSTRAINT works_mesh_work_id_descriptor_ui_qualifier_ui_pk;

ALTER TABLE openalex.works_open_access DROP CONSTRAINT works_open_access_pkey;
DROP INDEX works_open_access_is_oa_idx ON openalex.works_open_access;

ALTER TABLE openalex.works_primary_locations DROP CONSTRAINT works_primary_locations_pkey;

ALTER TABLE openalex.works_topics DROP CONSTRAINT works_topics_work_id_topic_id_pk;

-- Rewrite ID columns without URL prefixes
UPDATE openalex.authors SET
    id = regexp_replace(id, '^https://openalex\.org/', ''),
    orcid = CASE WHEN orcid IS NOT NULL THEN regexp_replace(orcid, '^https://orcid\.org/', '') ELSE NULL END;

UPDATE openalex.authors_ids SET
    author_id = regexp_replace(author_id, '^https://openalex\.org/', ''),
    openalex = CASE WHEN openalex IS NOT NULL THEN regexp_replace(openalex, '^https://openalex\.org/', '') ELSE NULL END,
    orcid = CASE WHEN orcid IS NOT NULL THEN regexp_replace(orcid, '^https://orcid\.org/', '') ELSE NULL END;

UPDATE openalex.concepts SET
    id = regexp_replace(id, '^https://openalex\.org/', '');

UPDATE openalex.works SET
    id = regexp_replace(id, '^https://openalex\.org/', ''),
    doi = CASE WHEN doi IS NOT NULL THEN regexp_replace(doi, '^https://doi\.org/', '') ELSE NULL END;

UPDATE openalex.works_ids SET
    work_id = regexp_replace(work_id, '^https://openalex\.org/', ''),
    openalex = CASE WHEN openalex IS NOT NULL THEN regexp_replace(openalex, '^https://openalex\.org/', '') ELSE NULL END,
    doi = CASE WHEN doi IS NOT NULL THEN regexp_replace(doi, '^https://doi\.org/', '') ELSE NULL END;

UPDATE openalex.works_concepts SET
    work_id = regexp_replace(work_id, '^https://openalex\.org/', ''),
    concept_id = regexp_replace(concept_id, '^https://openalex\.org/', '');

UPDATE openalex.works_locations SET
    work_id = regexp_replace(work_id, '^https://openalex\.org/', ''),
    source_id = regexp_replace(source_id, '^https://openalex\.org/', '');

UPDATE openalex.works_open_access SET
    work_id = regexp_replace(work_id, '^https://openalex\.org/', '');

UPDATE openalex.works_primary_locations SET
    work_id = regexp_replace(work_id, '^https://openalex\.org/', ''),
    source_id = regexp_replace(source_id, '^https://openalex\.org/', '');

UPDATE openalex.works_best_oa_locations SET
    work_id = regexp_replace(work_id, '^https://openalex\.org/', ''),
    source_id = regexp_replace(source_id, '^https://openalex\.org/', '');

UPDATE openalex.works_referenced_works SET
    work_id = regexp_replace(work_id, '^https://openalex\.org/', ''),
    referenced_work_id = regexp_replace(referenced_work_id, '^https://openalex\.org/', '');

UPDATE openalex.works_related_works SET
    work_id = regexp_replace(work_id, '^https://openalex\.org/', ''),
    related_work_id = regexp_replace(related_work_id, '^https://openalex\.org/', '');

UPDATE openalex.works_topics SET
    work_id = regexp_replace(work_id, '^https://openalex\.org/', ''),
    topic_id = regexp_replace(topic_id, '^https://openalex\.org/', '');

-- Recreate the removed indexes
ALTER TABLE openalex.works_referenced_works ADD CONSTRAINT works_referenced_works_work_id_referenced_work_id_pk PRIMARY KEY (work_id, referenced_work_id);

ALTER TABLE openalex.works_related_works ADD CONSTRAINT works_related_works_work_id_related_work_id_pk PRIMARY KEY (work_id, related_work_id);

ALTER TABLE openalex.works_concepts ADD CONSTRAINT works_concepts_concept_id_work_id_pk PRIMARY KEY (concept_id, work_id);

ALTER TABLE openalex.authors ADD CONSTRAINT authors_pkey PRIMARY KEY (id);

ALTER TABLE openalex.authors_ids ADD CONSTRAINT authors_ids_pkey PRIMARY KEY (author_id);

ALTER TABLE openalex.works_ids ADD CONSTRAINT works_ids_pkey PRIMARY KEY (work_id);

CREATE INDEX locations_work_id_idx ON openalex.works_locations USING btree (work_id);

ALTER TABLE openalex.works_mesh ADD CONSTRAINT works_mesh_work_id_descriptor_ui_qualifier_ui_pk PRIMARY KEY (work_id, descriptor_ui, qualifier_ui);

ALTER TABLE openalex.works_open_access ADD CONSTRAINT works_open_access_pkey PRIMARY KEY (work_id);
CREATE INDEX works_open_access_is_oa_idx ON openalex.works_open_access USING btree (is_oa);

ALTER TABLE openalex.works_primary_locations ADD CONSTRAINT works_primary_locations_pkey PRIMARY KEY (work_id);

ALTER TABLE openalex.works_topics ADD CONSTRAINT works_topics_work_id_topic_id_pk PRIMARY KEY (work_id, topic_id);

REINDEX (VERBOSE) TABLE openalex.works;
REINDEX (VERBOSE) TABLE openalex.works_batch;
REINDEX (VERBOSE) TABLE openalex.concepts;
REINDEX (VERBOSE) TABLE openalex.works_best_oa_locations;

-- Run full VACUUM (VERBOSE, ANALYZE) to purge bloat and update QP stats
VACUUM (VERBOSE, ANALYZE) openalex.authors_ids;
VACUUM (VERBOSE, ANALYZE) openalex.institutions_ids;
VACUUM (VERBOSE, ANALYZE) openalex.export_metadata;
VACUUM (VERBOSE, ANALYZE) openalex.sources_counts_by_year;
VACUUM (VERBOSE, ANALYZE) openalex.works_concepts;
VACUUM (VERBOSE, ANALYZE) openalex.works;
VACUUM (VERBOSE, ANALYZE) openalex.works_locations;
VACUUM (VERBOSE, ANALYZE) openalex.works_mesh;
VACUUM (VERBOSE, ANALYZE) openalex.works_primary_locations;
VACUUM (VERBOSE, ANALYZE) openalex.works_ids;
VACUUM (VERBOSE, ANALYZE) openalex.authors;
VACUUM (VERBOSE, ANALYZE) openalex.works_related_works;
VACUUM (VERBOSE, ANALYZE) openalex.batch;
VACUUM (VERBOSE, ANALYZE) openalex.works_batch;
VACUUM (VERBOSE, ANALYZE) openalex.works_open_access;
VACUUM (VERBOSE, ANALYZE) openalex.works_best_oa_locations;
VACUUM (VERBOSE, ANALYZE) openalex.authors_counts_by_year;
VACUUM (VERBOSE, ANALYZE) openalex.concepts_ids;
VACUUM (VERBOSE, ANALYZE) openalex.concepts;
VACUUM (VERBOSE, ANALYZE) openalex.works_referenced_works;
VACUUM (VERBOSE, ANALYZE) openalex.works_topics;
VACUUM (VERBOSE, ANALYZE) openalex.works_biblio;
VACUUM (VERBOSE, ANALYZE) openalex.concepts_counts_by_year;
VACUUM (VERBOSE, ANALYZE) openalex.concepts_ancestors;
VACUUM (VERBOSE, ANALYZE) openalex.concepts_related_concepts;
VACUUM (VERBOSE, ANALYZE) openalex.institutions;
VACUUM (VERBOSE, ANALYZE) openalex.institutions_associated_institutions;
VACUUM (VERBOSE, ANALYZE) openalex.institutions_counts_by_year;
VACUUM (VERBOSE, ANALYZE) openalex.institutions_geo;
VACUUM (VERBOSE, ANALYZE) openalex.publishers;
VACUUM (VERBOSE, ANALYZE) openalex.publishers_counts_by_year;
VACUUM (VERBOSE, ANALYZE) openalex.publishers_ids;
VACUUM (VERBOSE, ANALYZE) openalex.sources;
VACUUM (VERBOSE, ANALYZE) openalex.sources_ids;
VACUUM (VERBOSE, ANALYZE) openalex.topics;
VACUUM (VERBOSE, ANALYZE) openalex.works_authorships;

