import {
  pgTable,
  pgSchema,
  index,
  text,
  real,
  bigint,
  json,
  integer,
  timestamp,
  boolean,
  vector,
  primaryKey,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const openalex = pgSchema('openalex');

export const institutions_geoInOpenalex = openalex.table('institutions_geo', {
  institution_id: text().notNull(),
  city: text(),
  geonames_city_id: text(),
  region: text(),
  country_code: text(),
  country: text(),
  latitude: real(),
  longitude: real(),
}, (table) => [
  index('idx_institutions_geo').using('btree', table.institution_id.asc().nullsLast().op('text_ops')),
]);

export const institutions_idsInOpenalex = openalex.table('institutions_ids', {
  institution_id: text().notNull(),
  openalex: text(),
  ror: text(),
  grid: text(),
  wikipedia: text(),
  wikidata: text(),
  // You can use { mode: "bigint" } if numbers are exceeding js number limitations
  mag: bigint({ mode: 'number' }),
});

export const publishersInOpenalex = openalex.table('publishers', {
  id: text().notNull(),
  display_name: text(),
  alternate_titles: json(),
  country_codes: json(),
  hierarchy_level: integer(),
  parent_publisher: text(),
  works_count: integer(),
  cited_by_count: integer(),
  sources_api_url: text(),
  updated_date: timestamp({ mode: 'string' }),
}, (table) => [
  index('idx_publishers_id').using('btree', table.id.asc().nullsLast().op('text_ops')),
]);

export const publishers_counts_by_yearInOpenalex = openalex.table('publishers_counts_by_year', {
  publisher_id: text().notNull(),
  year: integer().notNull(),
  works_count: integer(),
  cited_by_count: integer(),
  oa_works_count: integer(),
}, (table) => [
  index('idx_publishers_counts').using('btree', table.publisher_id.asc().nullsLast().op('text_ops'), table.year.asc().nullsLast().op('int4_ops')),
]);

export const publishers_idsInOpenalex = openalex.table('publishers_ids', {
  publisher_id: text(),
  openalex: text(),
  ror: text(),
  wikidata: text(),
}, (table) => [
  index('idx_publishers_ids_publisher_id').using('btree', table.publisher_id.asc().nullsLast().op('text_ops')),
]);

export const institutions_associated_institutionsInOpenalex = openalex.table('institutions_associated_institutions', {
  institution_id: text(),
  associated_institution_id: text(),
  relationship: text(),
}, (table) => [
  index('idx_institutions_id').using('btree', table.institution_id.asc().nullsLast().op('text_ops')),
]);

export const worksInOpenalex = openalex.table('works', {
  id: text().primaryKey(),
  doi: text(),
  title: text(),
  display_name: text(),
  publication_year: integer(),
  publication_date: text(),
  type: text(),
  cited_by_count: integer(),
  is_retracted: boolean(),
  is_paratext: boolean(),
  cited_by_api_url: text(),
  abstract_inverted_index: json(),
  language: text(),
}, (table) => [{
  works_doi_idx: index('works_doi_idx').on(table.doi),
  works_publication_year_idx: index('works_publication_year_idx').on(table.publication_year),
}]);

export const works_primary_locationsInOpenalex = openalex.table('works_primary_locations', {
  work_id: text().primaryKey(),
  source_id: text(),
  landing_page_url: text(),
  pdf_url: text(),
  is_oa: boolean(),
  version: text(),
  license: text(),
});

export const sourcesInOpenalex = openalex.table('sources', {
  id: text().primaryKey(),
  issn_l: text(),
  issn: json(),
  display_name: text(),
  publisher: text(),
  works_count: integer(),
  cited_by_count: integer(),
  is_oa: boolean(),
  is_in_doaj: boolean(),
  homepage_url: text(),
  works_api_url: text(),
  updated_date: timestamp({ mode: 'string' }),
});

export const sources_counts_by_yearInOpenalex = openalex.table('sources_counts_by_year', {
  source_id: text().notNull(),
  year: integer().notNull(),
  works_count: integer(),
  cited_by_count: integer(),
  oa_works_count: integer(),
}, (table) => [
  index('idx_source_id').using('btree', table.source_id.asc().nullsLast().op('text_ops')),
  index('idx_sources_counts').using('btree', table.source_id.asc().nullsLast().op('text_ops'), table.year.asc().nullsLast().op('int4_ops')),
]);

export const works_biblioInOpenalex = openalex.table('works_biblio', {
  work_id: text().primaryKey(),
  volume: text(),
  issue: text(),
  first_page: text(),
  last_page: text(),
});

export const works_conceptsInOpenalex = openalex.table('works_concepts', {
  work_id: text(),
  concept_id: text(),
  score: real(),
}, (table) => [
  primaryKey({ columns: [table.concept_id, table.work_id] }),
]);

export const works_meshInOpenalex = openalex.table('works_mesh', {
  work_id: text(),
  descriptor_ui: text(),
  descriptor_name: text(),
  qualifier_ui: text(),
  qualifier_name: text(),
  is_major_topic: boolean(),
}, (table) => [
  primaryKey({ columns: [table.work_id, table.descriptor_ui, table.qualifier_ui] }),
  index('mesh_work_id_idx').using('btree', table.work_id),
]);

export const works_open_accessInOpenalex = openalex.table('works_open_access', {
  work_id: text().primaryKey(),
  is_oa: boolean(),
  oa_status: text(),
  oa_url: text(),
  any_repository_has_fulltext: boolean(),
}, (table) => [
  index('works_open_access_is_oa_idx').on(table.is_oa),
]);

export const sources_idsInOpenalex = openalex.table('sources_ids', {
  source_id: text(),
  openalex: text(),
  issn_l: text(),
  issn: json(),
  // You can use { mode: "bigint" } if numbers are exceeding js number limitations
  mag: bigint({ mode: 'number' }),
  wikidata: text(),
  fatcat: text(),
});

export const works_locationsInOpenalex = openalex.table('works_locations', {
  work_id: text(),
  source_id: text(),
  landing_page_url: text(),
  pdf_url: text(),
  is_oa: boolean(),
  version: text(),
  license: text(),
}, (table) => [
  index('locations_work_id_idx').on(table.work_id),
]);

export const works_referenced_worksInOpenalex = openalex.table('works_referenced_works', {
  work_id: text(),
  referenced_work_id: text(),
}, (table) => [
  primaryKey({ columns: [table.work_id, table.referenced_work_id] }),
  index('referenced_works_referenced_work_id_idx').on(table.referenced_work_id),
  index('referenced_works_work_id_idx').on(table.work_id),
]);

export const topicsInOpenalex = openalex.table('topics', {
  id: text().primaryKey(),
  display_name: text(),
  subfield_id: text(),
  subfield_display_name: text(),
  field_id: text(),
  field_display_name: text(),
  domain_id: text(),
  domain_display_name: text(),
  description: text(),
  keywords: text(),
  works_api_url: text(),
  wikipedia_id: text(),
  works_count: integer(),
  cited_by_count: integer(),
  updated_date: timestamp({ mode: 'string' }),
  siblings: text(),
});

export const works_idsInOpenalex = openalex.table('works_ids', {
  work_id: text().primaryKey(),
  openalex: text(),
  doi: text(),
  // You can use { mode: "bigint" } if numbers are exceeding js number limitations
  mag: bigint({ mode: 'number' }),
  pmid: text(),
  pmcid: text(),
});

export const works_related_worksInOpenalex = openalex.table('works_related_works', {
  work_id: text(),
  related_work_id: text(),
}, (table) => [
  primaryKey({ columns: [table.work_id, table.related_work_id] }),
  index('related_works_work_id_idx').on(table.work_id),
  index('related_works_related_work_id_idx').on(table.related_work_id),
]);

export const works_topicsInOpenalex = openalex.table('works_topics', {
  work_id: text(),
  topic_id: text(),
  score: real(),
}, (table) => [
  primaryKey({ columns: [table.work_id, table.topic_id] }),
  index('topics_work_id_idx').on(table.work_id),
  index('topics_topic_id_idx').on(table.topic_id),
]);

export const authorsInOpenalex = openalex.table('authors', {
  id: text().primaryKey(),
  orcid: text(),
  display_name: text(),
  display_name_alternatives: json(),
  works_count: integer(),
  cited_by_count: integer(),
  last_known_institution: text(),
  works_api_url: text(),
  updated_date: timestamp({ mode: 'string' }),
});

export const authors_counts_by_yearInOpenalex = openalex.table('authors_counts_by_year', {
  author_id: text().notNull(),
  year: integer().notNull(),
  works_count: integer(),
  cited_by_count: integer(),
  oa_works_count: integer(),
}, (table) => [
  primaryKey({ columns: [table.author_id, table.year] }),
  index('authors_counts_by_year_year_idx').on(table.year),
]);

export const authors_idsInOpenalex = openalex.table('authors_ids', {
  author_id: text().primaryKey(),
  openalex: text(),
  orcid: text(),
  scopus: text(),
  twitter: text(),
  wikipedia: text(),
  // You can use { mode: "bigint" } if numbers are exceeding js number limitations
  mag: bigint({ mode: 'number' }),
}, (table) => [
  index('authors_ids_openalex_idx').on(table.openalex),
  index('authors_ids_orcid_idx').on(table.orcid),
]);

export const institutionsInOpenalex = openalex.table('institutions', {
  id: text().primaryKey(),
  ror: text(),
  display_name: text(),
  country_code: text(),
  type: text(),
  homepage_url: text(),
  image_url: text(),
  image_thumbnail_url: text(),
  display_name_acronyms: json(),
  display_name_alternatives: json(),
  works_count: integer(),
  cited_by_count: integer(),
  works_api_url: text(),
  updated_date: timestamp({ mode: 'string' }),
}, (table) => [
  index('institutions_id_idx').using('btree', table.id.asc().nullsLast().op('text_ops')),
  index('institutions_ror_idx').using('btree', table.ror.asc().nullsLast().op('text_ops')),
]);

export const institutions_counts_by_yearInOpenalex = openalex.table('institutions_counts_by_year', {
  institution_id: text().notNull(),
  year: integer().notNull(),
  works_count: integer(),
  cited_by_count: integer(),
  oa_works_count: integer(),
}, (table) => [
  index('idx_institution_year').using('btree', table.institution_id.asc().nullsLast().op('text_ops'), table.year.asc().nullsLast().op('int4_ops')),
]);

export const conceptsInOpenalex = openalex.table('concepts', {
  id: text().notNull(),
  wikidata: text(),
  display_name: text(),
  level: integer(),
  description: text(),
  works_count: integer(),
  cited_by_count: integer(),
  image_url: text(),
  image_thumbnail_url: text(),
  works_api_url: text(),
  updated_date: timestamp({ mode: 'string' }),
  descriptions_embeddings: vector('descriptions_embeddings', { dimensions: 768 }),
  name_embeddings: vector('name_embeddings', { dimensions: 768 }),
}, (table) => [
  index('concepts_descriptions_embeddings_idx').using('ivfflat', table.descriptions_embeddings.asc().nullsLast().op('vector_l2_ops')).with({ lists: '100' }),
  index('concepts_id_idx').using('btree', table.id.asc().nullsLast().op('text_ops')),
  index('concepts_name_embeddings_idx').using('ivfflat', table.name_embeddings.asc().nullsLast().op('vector_l2_ops')).with({ lists: '100' }),
]);

export const concepts_ancestorsInOpenalex = openalex.table('concepts_ancestors', {
  concept_id: text(),
  ancestor_id: text(),
}, (table) => [
  index('concepts_ancestors_concept_id_idx').using('btree', table.concept_id.asc().nullsLast().op('text_ops')),
]);

export const concepts_counts_by_yearInOpenalex = openalex.table('concepts_counts_by_year', {
  concept_id: text().notNull(),
  year: integer().notNull(),
  works_count: integer(),
  cited_by_count: integer(),
  oa_works_count: integer(),
}, (table) => [
  index('idx_concept_id').using('btree', table.concept_id.asc().nullsLast().op('text_ops')),
  index('idx_concept_id_by_year').using('btree', table.concept_id.asc().nullsLast().op('text_ops')),
  index('idx_concepts_counts').using('btree', table.concept_id.asc().nullsLast().op('text_ops'), table.year.asc().nullsLast().op('int4_ops')),
]);

export const works_authorshipsInOpenalex = openalex.table('works_authorships', {
  work_id: text(),
  author_position: text(),
  author_id: text(),
  institution_id: text(),
  raw_affiliation_string: text(),
}, (table) => [
  primaryKey({ columns: [table.work_id, table.author_id] }),
  index('works_authorships_author_id_idx').on(table.author_id),
  index('works_authorships_work_id_idx').on(table.work_id),
]);

export const works_best_oa_locationsInOpenalex = openalex.table('works_best_oa_locations', {
  work_id: text().primaryKey(),
  source_id: text(),
  landing_page_url: text(),
  pdf_url: text(),
  is_oa: boolean(),
  version: text(),
  license: text(),
});

export const concepts_idsInOpenalex = openalex.table('concepts_ids', {
  concept_id: text().notNull(),
  openalex: text(),
  wikidata: text(),
  wikipedia: text(),
  umls_aui: json(),
  umls_cui: json(),
  // You can use { mode: "bigint" } if numbers are exceeding js number limitations
  mag: bigint({ mode: 'number' }),
}, (table) => [
  index('idx_concept_ids').using('btree', table.concept_id.asc().nullsLast().op('text_ops')),
]);

export const concepts_related_conceptsInOpenalex = openalex.table('concepts_related_concepts', {
  concept_id: text(),
  related_concept_id: text(),
  score: real(),
}, (table) => [
  index('concepts_related_concepts_concept_id_idx').using('btree', table.concept_id.asc().nullsLast().op('text_ops')),
  index('concepts_related_concepts_related_concept_id_idx').using('btree', table.related_concept_id.asc().nullsLast().op('text_ops')),
]);
