import type { Work } from '../types/works.js';

/**
 * Minimal valid Work as returned by the OpenAlex API.
 * All required arrays are present; optional sub-objects are populated.
 */
export const minimalWork: Work = {
  id: 'https://openalex.org/W1234567890',
  doi: 'https://doi.org/10.1234/test.2024.001',
  title: 'A Minimal Test Work',
  display_name: 'A Minimal Test Work',
  publication_year: 2024,
  publication_date: '2024-03-15',
  language: 'en',
  type: 'journal-article',
  type_crossref: 'journal-article',
  cited_by_count: 5,
  is_retracted: false,
  is_paratext: false,
  cited_by_api_url: 'https://api.openalex.org/works?filter=cites:W1234567890',
  abstract_inverted_index: { test: [0], abstract: [1] },
  ids: {
    openalex: 'https://openalex.org/W1234567890',
    doi: 'https://doi.org/10.1234/test.2024.001',
    mag: 1234567890,
    pmid: null,
    pmcid: null,
  },
  primary_location: {
    is_oa: true,
    landing_page_url: 'https://example.com/article',
    pdf_url: 'https://example.com/article.pdf',
    source: {
      id: 'https://openalex.org/S100',
      display_name: 'Test Journal',
      issn_l: '1234-5678',
      issn: ['1234-5678'],
      is_oa: true,
      is_in_doaj: true,
      is_core: false,
      host_organization: 'https://openalex.org/P1',
      host_organization_name: 'Test Publisher',
      host_organization_lineage: [],
      host_organization_lineage_names: [],
      type: 'journal',
    },
    license: 'cc-by',
    license_id: 'https://openalex.org/licenses/cc-by',
    version: 'publishedVersion',
    is_accepted: true,
    is_published: true,
  },
  best_oa_location: {
    is_oa: true,
    landing_page_url: 'https://example.com/article',
    pdf_url: 'https://example.com/article.pdf',
    source: {
      id: 'https://openalex.org/S100',
      display_name: 'Test Journal',
      issn_l: null,
      issn: null,
      is_oa: true,
      is_in_doaj: true,
      is_core: false,
      host_organization: null,
      host_organization_name: null,
      host_organization_lineage: [],
      host_organization_lineage_names: [],
      type: 'journal',
    },
    license: 'cc-by',
    license_id: 'https://openalex.org/licenses/cc-by',
    version: 'publishedVersion',
    is_accepted: true,
    is_published: true,
  },
  open_access: {
    is_oa: true,
    oa_status: 'gold',
    oa_url: 'https://example.com/article',
    any_repository_has_fulltext: false,
  },
  authorships: [
    {
      author_position: 'first',
      author: {
        id: 'https://openalex.org/A001',
        display_name: 'Jane Doe',
        orcid: 'https://orcid.org/0000-0001-2345-6789',
        twitter: null,
        scopus: null,
        wikipedia: null,
        mag: null,
      },
      institutions: [
        {
          id: 'https://openalex.org/I001',
          ror: 'https://ror.org/test001',
          display_name: 'Test University',
          country_code: 'US',
          type: 'education',
          type_id: 'https://openalex.org/institution-types/education',
          lineage: [],
          homepage_url: 'https://test.edu',
          image_url: '',
          image_thumbnail_url: '',
          display_name_acronyms: [],
          display_name_alternatives: [],
          repositories: [],
          works_count: 1000,
          cited_by_count: 5000,
          summary_stats: { '2yr_mean_citedness': 2.5, h_index: 50, i10_index: 100 },
          ids: { openalex: 'I001' },
          geo: { city: 'Test City', geonames_city_id: '123', region: null, country_code: 'US', country: 'United States', latitude: 40.0, longitude: -74.0 },
          international: { display_name: {} as any },
          associated_institutions: [],
          counts_by_year: [],
          roles: [],
          topics: [],
          topic_share: [],
          x_concepts: [],
          is_super_system: false,
          works_api_url: '',
          updated_date: '2024-01-01',
          created_date: '2020-01-01',
        },
      ],
      countries: ['US'],
      is_corresponding: true,
      raw_author_name: 'Jane Doe',
      raw_affiliation_strings: [],
      affiliations: [],
    },
  ],
  biblio: {
    volume: '42',
    issue: '3',
    first_page: '100',
    last_page: '110',
  },
  concepts: [
    { id: 'https://openalex.org/C100', wikidata: null, display_name: 'Computer Science', level: 0, score: 0.85, description: null, works_count: null, cited_by_count: null, image_url: null, image_thumbnail_url: null, works_api_url: null, updated_date: null },
  ],
  topics: [
    { id: 'https://openalex.org/T100', display_name: 'Machine Learning', count: 100, subfield: { id: 'S1', display_name: 'AI' }, field: { id: 'F1', display_name: 'CS' }, domain: { id: 'D1', display_name: 'Sciences' }, score: 0.9 } as any,
  ],
  mesh: [
    { descriptor_ui: 'D000001', descriptor_name: 'Calcimycin', qualifier_ui: 'Q000031', qualifier_name: 'analysis', is_major_topic: true },
  ],
  locations: [
    {
      is_oa: true,
      landing_page_url: 'https://example.com/article',
      pdf_url: 'https://example.com/article.pdf',
      source: { id: 'https://openalex.org/S100', display_name: 'Test Journal', issn_l: null, issn: null, is_oa: true, is_in_doaj: true, is_core: false, host_organization: null, host_organization_name: null, host_organization_lineage: [], host_organization_lineage_names: [], type: 'journal' },
      license: 'cc-by',
      license_id: 'cc-by',
      version: 'publishedVersion',
      is_accepted: true,
      is_published: true,
    },
  ],
  referenced_works: ['https://openalex.org/W9999'],
  related_works: ['https://openalex.org/W8888'],
  indexed_in: ['crossref'],
  countries_distinct_count: 1,
  institutions_distinct_count: 1,
  corresponding_author_ids: [],
  corresponding_institution_ids: [],
  apc_list: null,
  apc_paid: null,
  fwci: 1.5,
  has_fulltext: true,
  fulltext_origin: 'pdf',
  cited_by_percentile_year: { min: 80, max: 90 },
  primary_topic: null,
  keywords: [],
  locations_count: 1,
  sustainable_development_goals: [],
  grants: [],
  datasets: [],
  versions: [],
  referenced_works_count: 1,
  ngrams_url: '',
  counts_by_year: [{ year: 2024, cited_by_count: 5 }],
  updated_date: '2024-03-20',
  created_date: '2024-03-15',
};

/**
 * Reproduces the exact crash scenario: mesh entries where OpenAlex returns
 * null/empty qualifier_ui values. The transformer passes these through as-is,
 * and the DB layer must handle the resulting null PKs gracefully.
 */
export const workWithNullMeshQualifiers: Work = {
  ...minimalWork,
  id: 'https://openalex.org/W1111111111',
  doi: 'https://doi.org/10.1234/null-mesh',
  mesh: [
    { descriptor_ui: 'D000001', descriptor_name: 'Calcimycin', qualifier_ui: null as any, qualifier_name: null as any, is_major_topic: true },
    { descriptor_ui: 'D000002', descriptor_name: 'Temefos', qualifier_ui: null as any, qualifier_name: null as any, is_major_topic: false },
    { descriptor_ui: null as any, descriptor_name: null as any, qualifier_ui: 'Q000031', qualifier_name: 'analysis', is_major_topic: true },
  ],
};

/**
 * Work with no primary_location or best_oa_location (common for preprints/datasets).
 */
export const workWithNoPrimaryLocation: Work = {
  ...minimalWork,
  id: 'https://openalex.org/W2222222222',
  doi: null as any,
  primary_location: null as any,
  best_oa_location: null as any,
  locations: [],
};

/**
 * Work with empty arrays for all child entities — the "bare bones" response.
 */
export const workWithEmptyArrays: Work = {
  ...minimalWork,
  id: 'https://openalex.org/W3333333333',
  authorships: [],
  concepts: [],
  topics: [],
  mesh: [],
  locations: [],
  referenced_works: [],
  related_works: [],
};

/**
 * Work with duplicate authorships (same author appears twice, e.g. multi-affiliation).
 */
export const workWithDuplicateAuthorships: Work = {
  ...minimalWork,
  id: 'https://openalex.org/W4444444444',
  authorships: [
    minimalWork.authorships[0],
    {
      ...minimalWork.authorships[0],
      institutions: [
        {
          ...minimalWork.authorships[0].institutions[0],
          id: 'https://openalex.org/I002',
          display_name: 'Second University',
        },
      ],
    },
  ],
};

/**
 * Work with concepts/topics that have null IDs (seen in older OpenAlex data).
 */
export const workWithNullConceptAndTopicIds: Work = {
  ...minimalWork,
  id: 'https://openalex.org/W5555555555',
  concepts: [
    { id: null as any, wikidata: null, display_name: 'Unknown', level: 0, score: 0.5, description: null, works_count: null, cited_by_count: null, image_url: null, image_thumbnail_url: null, works_api_url: null, updated_date: null },
    { id: 'https://openalex.org/C200', wikidata: null, display_name: 'Biology', level: 0, score: 0.8, description: null, works_count: null, cited_by_count: null, image_url: null, image_thumbnail_url: null, works_api_url: null, updated_date: null },
  ],
  topics: [
    { id: null as any, display_name: 'Unknown Topic', count: 0, subfield: { id: 'S1', display_name: 'AI' }, field: { id: 'F1', display_name: 'CS' }, domain: { id: 'D1', display_name: 'Sciences' }, score: 0.3 } as any,
    { id: 'https://openalex.org/T200', display_name: 'Genomics', count: 50, subfield: { id: 'S2', display_name: 'Bio' }, field: { id: 'F2', display_name: 'Life' }, domain: { id: 'D2', display_name: 'Life Sciences' }, score: 0.7 } as any,
  ],
};

/**
 * Work where authorships have null author IDs (corrupt data from API).
 */
export const workWithNullAuthorIds: Work = {
  ...minimalWork,
  id: 'https://openalex.org/W6666666666',
  authorships: [
    {
      ...minimalWork.authorships[0],
      author: { ...minimalWork.authorships[0].author, id: null as any },
    },
    minimalWork.authorships[0],
  ],
};
