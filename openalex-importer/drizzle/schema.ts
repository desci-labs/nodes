import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  date,
  index,
  integer,
  json,
  pgSchema,
  pgTable,
  real,
  text,
  timestamp,
  vector,
} from 'drizzle-orm/pg-core';

export const openalex = pgSchema('openalex');

export const institutions_geoInOpenalex = openalex.table('institutions_geo', {
  institution_id: text('institution_id').notNull(),
  city: text('city'),
  geonames_city_id: text('geonames_city_id'),
  region: text('region'),
  country_code: text('country_code'),
  country: text('country'),
  latitude: real('latitude'),
  longitude: real('longitude'),
});

export const institutions_idsInOpenalex = openalex.table('institutions_ids', {
  institution_id: text('institution_id').notNull(),
  openalex: text('openalex'),
  ror: text('ror'),
  grid: text('grid'),
  wikipedia: text('wikipedia'),
  wikidata: text('wikidata'),
  // You can use { mode: "bigint" } if numbers are exceeding js number limitations
  mag: bigint('mag', { mode: 'number' }),
});

export const publishersInOpenalex = openalex.table('publishers', {
  id: text('id').notNull(),
  display_name: text('display_name'),
  alternate_titles: json('alternate_titles'),
  country_codes: json('country_codes'),
  hierarchy_level: integer('hierarchy_level'),
  parent_publisher: text('parent_publisher'),
  works_count: integer('works_count'),
  cited_by_count: integer('cited_by_count'),
  sources_api_url: text('sources_api_url'),
  updated_date: timestamp('updated_date', { mode: 'string' }),
});

export const publishers_counts_by_yearInOpenalex = openalex.table('publishers_counts_by_year', {
  publisher_id: text('publisher_id').notNull(),
  year: integer('year').notNull(),
  works_count: integer('works_count'),
  cited_by_count: integer('cited_by_count'),
  oa_works_count: integer('oa_works_count'),
});

export const publishers_idsInOpenalex = openalex.table('publishers_ids', {
  publisher_id: text('publisher_id'),
  openalex: text('openalex'),
  ror: text('ror'),
  wikidata: text('wikidata'),
});

export const institutions_associated_institutionsInOpenalex = openalex.table('institutions_associated_institutions', {
  institution_id: text('institution_id'),
  associated_institution_id: text('associated_institution_id'),
  relationship: text('relationship'),
});

export const works_primary_locationsInOpenalex = openalex.table(
  'works_primary_locations',
  {
    work_id: text('work_id'),
    source_id: text('source_id'),
    landing_page_url: text('landing_page_url'),
    pdf_url: text('pdf_url'),
    is_oa: boolean('is_oa'),
    version: text('version'),
    license: text('license'),
  },
  (table) => {
    return {
      work_id_idx: index('works_primary_locations_work_id_idx').using('btree', table.work_id),
    };
  },
);

export const worksInOpenalex = openalex.table(
  'works',
  {
    id: text('id').notNull(),
    doi: text('doi'),
    title: text('title'),
    display_name: text('display_name'),
    publication_year: integer('publication_year'),
    publication_date: text('publication_date'),
    type: text('type'),
    cited_by_count: integer('cited_by_count'),
    is_retracted: boolean('is_retracted'),
    is_paratext: boolean('is_paratext'),
    cited_by_api_url: text('cited_by_api_url'),
    abstract_inverted_index: json('abstract_inverted_index'),
    language: text('language'),
    publication_date_date: date('publication_date_date'),
  },
  (table) => {
    return {
      publication_date_idx: index('works_publication_date_idx').using('btree', table.publication_date),
    };
  },
);

export const institutionsInOpenalex = openalex.table('institutions', {
  id: text('id').notNull(),
  ror: text('ror'),
  display_name: text('display_name'),
  country_code: text('country_code'),
  type: text('type'),
  homepage_url: text('homepage_url'),
  image_url: text('image_url'),
  image_thumbnail_url: text('image_thumbnail_url'),
  display_name_acronyms: json('display_name_acronyms'),
  display_name_alternatives: json('display_name_alternatives'),
  works_count: integer('works_count'),
  cited_by_count: integer('cited_by_count'),
  works_api_url: text('works_api_url'),
  updated_date: timestamp('updated_date', { mode: 'string' }),
});

export const institutions_counts_by_yearInOpenalex = openalex.table('institutions_counts_by_year', {
  institution_id: text('institution_id').notNull(),
  year: integer('year').notNull(),
  works_count: integer('works_count'),
  cited_by_count: integer('cited_by_count'),
  oa_works_count: integer('oa_works_count'),
});

export const sourcesInOpenalex = openalex.table('sources', {
  id: text('id').notNull(),
  issn_l: text('issn_l'),
  issn: json('issn'),
  display_name: text('display_name'),
  publisher: text('publisher'),
  works_count: integer('works_count'),
  cited_by_count: integer('cited_by_count'),
  is_oa: boolean('is_oa'),
  is_in_doaj: boolean('is_in_doaj'),
  homepage_url: text('homepage_url'),
  works_api_url: text('works_api_url'),
  updated_date: timestamp('updated_date', { mode: 'string' }),
});

export const sources_counts_by_yearInOpenalex = openalex.table('sources_counts_by_year', {
  source_id: text('source_id').notNull(),
  year: integer('year').notNull(),
  works_count: integer('works_count'),
  cited_by_count: integer('cited_by_count'),
  oa_works_count: integer('oa_works_count'),
});

export const works_biblioInOpenalex = openalex.table('works_biblio', {
  work_id: text('work_id').notNull(),
  volume: text('volume'),
  issue: text('issue'),
  first_page: text('first_page'),
  last_page: text('last_page'),
});

export const works_conceptsInOpenalex = openalex.table(
  'works_concepts',
  {
    work_id: text('work_id'),
    concept_id: text('concept_id'),
    score: real('score'),
  },
  (table) => {
    return {
      concept_id_idx: index('works_concepts_concept_id_idx').using('btree', table.concept_id),
      work_id_idx: index('works_concepts_work_id_idx').using('btree', table.work_id),
    };
  },
);

export const works_idsInOpenalex = openalex.table('works_ids', {
  work_id: text('work_id').notNull(),
  openalex: text('openalex'),
  doi: text('doi'),
  // You can use { mode: "bigint" } if numbers are exceeding js number limitations
  mag: bigint('mag', { mode: 'number' }),
  pmid: text('pmid'),
  pmcid: text('pmcid'),
});

export const works_meshInOpenalex = openalex.table(
  'works_mesh',
  {
    work_id: text('work_id'),
    descriptor_ui: text('descriptor_ui'),
    descriptor_name: text('descriptor_name'),
    qualifier_ui: text('qualifier_ui'),
    qualifier_name: text('qualifier_name'),
    is_major_topic: boolean('is_major_topic'),
  },
  (table) => {
    return {
      descriptor_ui_idx: index('works_mesh_descriptor_ui_idx').using('btree', table.descriptor_ui),
      qualifier_ui_idx: index('works_mesh_qualifier_ui_idx').using('btree', table.qualifier_ui),
      work_id_idx: index('works_mesh_work_id_idx').using('btree', table.work_id),
    };
  },
);

export const works_open_accessInOpenalex = openalex.table(
  'works_open_access',
  {
    work_id: text('work_id').notNull(),
    is_oa: boolean('is_oa'),
    oa_status: text('oa_status'),
    oa_url: text('oa_url'),
    any_repository_has_fulltext: boolean('any_repository_has_fulltext'),
  },
  (table) => {
    return {
      work_id_idx: index('works_open_access_work_id_idx').using('btree', table.work_id),
      work_id_idx1: index('works_open_access_work_id_idx1').using('btree', table.work_id),
    };
  },
);

export const sources_idsInOpenalex = openalex.table('sources_ids', {
  source_id: text('source_id'),
  openalex: text('openalex'),
  issn_l: text('issn_l'),
  issn: json('issn'),
  // You can use { mode: "bigint" } if numbers are exceeding js number limitations
  mag: bigint('mag', { mode: 'number' }),
  wikidata: text('wikidata'),
  fatcat: text('fatcat'),
});

export const works_locationsInOpenalex = openalex.table(
  'works_locations',
  {
    work_id: text('work_id'),
    source_id: text('source_id'),
    landing_page_url: text('landing_page_url'),
    pdf_url: text('pdf_url'),
    is_oa: boolean('is_oa'),
    version: text('version'),
    license: text('license'),
  },
  (table) => {
    return {
      work_id_idx: index('works_locations_work_id_idx').using('btree', table.work_id),
    };
  },
);

export const works_referenced_worksInOpenalex = openalex.table(
  'works_referenced_works',
  {
    work_id: text('work_id'),
    referenced_work_id: text('referenced_work_id'),
  },
  (table) => {
    return {
      referenced_work_id_idx: index('works_referenced_works_referenced_work_id_idx').using(
        'btree',
        table.referenced_work_id,
      ),
      work_id_idx: index('works_referenced_works_work_id_idx').using('btree', table.work_id),
    };
  },
);

export const works_related_worksInOpenalex = openalex.table(
  'works_related_works',
  {
    work_id: text('work_id'),
    related_work_id: text('related_work_id'),
  },
  (table) => {
    return {
      related_work_id_idx: index('works_related_works_related_work_id_idx').using('btree', table.related_work_id),
      work_id_idx: index('works_related_works_work_id_idx').using('btree', table.work_id),
    };
  },
);

export const works_topicsInOpenalex = openalex.table(
  'works_topics',
  {
    work_id: text('work_id'),
    topic_id: text('topic_id'),
    score: real('score'),
  },
  (table) => {
    return {
      topic_id_idx: index('works_topics_topic_id_idx').using('btree', table.topic_id),
      work_id_idx: index('works_topics_work_id_idx').using('btree', table.work_id),
    };
  },
);

export const authorsInOpenalex = openalex.table('authors', {
  id: text('id').notNull(),
  orcid: text('orcid'),
  display_name: text('display_name'),
  display_name_alternatives: json('display_name_alternatives'),
  works_count: integer('works_count'),
  cited_by_count: integer('cited_by_count'),
  last_known_institution: text('last_known_institution'),
  works_api_url: text('works_api_url'),
  updated_date: timestamp('updated_date', { mode: 'string' }),
});

export const authors_counts_by_yearInOpenalex = openalex.table('authors_counts_by_year', {
  author_id: text('author_id').notNull(),
  year: integer('year').notNull(),
  works_count: integer('works_count'),
  cited_by_count: integer('cited_by_count'),
  oa_works_count: integer('oa_works_count'),
});

export const authors_idsInOpenalex = openalex.table('authors_ids', {
  author_id: text('author_id').notNull(),
  openalex: text('openalex'),
  orcid: text('orcid'),
  scopus: text('scopus'),
  twitter: text('twitter'),
  wikipedia: text('wikipedia'),
  // You can use { mode: "bigint" } if numbers are exceeding js number limitations
  mag: bigint('mag', { mode: 'number' }),
});

export const topicsInOpenalex = openalex.table('topics', {
  id: text('id').notNull(),
  display_name: text('display_name'),
  subfield_id: text('subfield_id'),
  subfield_display_name: text('subfield_display_name'),
  field_id: text('field_id'),
  field_display_name: text('field_display_name'),
  domain_id: text('domain_id'),
  domain_display_name: text('domain_display_name'),
  description: text('description'),
  keywords: text('keywords'),
  works_api_url: text('works_api_url'),
  wikipedia_id: text('wikipedia_id'),
  works_count: integer('works_count'),
  cited_by_count: integer('cited_by_count'),
  updated_date: timestamp('updated_date', { mode: 'string' }),
});

export const conceptsInOpenalex = openalex.table(
  'concepts',
  {
    id: text('id').notNull(),
    wikidata: text('wikidata'),
    display_name: text('display_name'),
    level: integer('level'),
    description: text('description'),
    works_count: integer('works_count'),
    cited_by_count: integer('cited_by_count'),
    image_url: text('image_url'),
    image_thumbnail_url: text('image_thumbnail_url'),
    works_api_url: text('works_api_url'),
    updated_date: timestamp('updated_date', { mode: 'string' }),
    descriptions_embeddings: vector('descriptions_embeddings', { dimensions: 768 }),
    name_embeddings: vector('name_embeddings', { dimensions: 768 }),
  },
  (table) => {
    return {
      descriptions_embeddings_idx: index('concepts_descriptions_embeddings_idx')
        .using('ivfflat', table.descriptions_embeddings.op('vector_l2_ops'))
        .with({ lists: '100' }),
      name_embeddings_idx: index('concepts_name_embeddings_idx')
        .using('ivfflat', table.name_embeddings.op('vector_l2_ops'))
        .with({ lists: '100' }),
    };
  },
);

export const concepts_ancestorsInOpenalex = openalex.table(
  'concepts_ancestors',
  {
    concept_id: text('concept_id'),
    ancestor_id: text('ancestor_id'),
  },
  (table) => {
    return {
      concept_id_idx: index('concepts_ancestors_concept_id_idx').using('btree', table.concept_id),
    };
  },
);

export const concepts_counts_by_yearInOpenalex = openalex.table('concepts_counts_by_year', {
  concept_id: text('concept_id').notNull(),
  year: integer('year').notNull(),
  works_count: integer('works_count'),
  cited_by_count: integer('cited_by_count'),
  oa_works_count: integer('oa_works_count'),
});

export const works_authorshipsInOpenalex = openalex.table(
  'works_authorships',
  {
    work_id: text('work_id'),
    author_position: text('author_position'),
    author_id: text('author_id'),
    institution_id: text('institution_id'),
    raw_affiliation_string: text('raw_affiliation_string'),
  },
  (table) => {
    return {
      author_id_idx: index('works_authorships_author_id_idx').using('btree', table.author_id),
      institution_id_idx: index('works_authorships_institution_id_idx').using('btree', table.institution_id),
      work_id_idx: index('works_authorships_work_id_idx').using('btree', table.work_id),
    };
  },
);

export const works_best_oa_locationsInOpenalex = openalex.table(
  'works_best_oa_locations',
  {
    work_id: text('work_id'),
    source_id: text('source_id'),
    landing_page_url: text('landing_page_url'),
    pdf_url: text('pdf_url'),
    is_oa: boolean('is_oa'),
    version: text('version'),
    license: text('license'),
  },
  (table) => {
    return {
      work_id_idx: index('works_best_oa_locations_work_id_idx').using('btree', table.work_id),
    };
  },
);

export const concepts_idsInOpenalex = openalex.table('concepts_ids', {
  concept_id: text('concept_id').notNull(),
  openalex: text('openalex'),
  wikidata: text('wikidata'),
  wikipedia: text('wikipedia'),
  umls_aui: json('umls_aui'),
  umls_cui: json('umls_cui'),
  // You can use { mode: "bigint" } if numbers are exceeding js number limitations
  mag: bigint('mag', { mode: 'number' }),
});

export const concepts_related_conceptsInOpenalex = openalex.table(
  'concepts_related_concepts',
  {
    concept_id: text('concept_id'),
    related_concept_id: text('related_concept_id'),
    score: real('score'),
  },
  (table) => {
    return {
      concept_id_idx: index('concepts_related_concepts_concept_id_idx').using('btree', table.concept_id),
      related_concept_id_idx: index('concepts_related_concepts_related_concept_id_idx').using(
        'btree',
        table.related_concept_id,
      ),
    };
  },
);
