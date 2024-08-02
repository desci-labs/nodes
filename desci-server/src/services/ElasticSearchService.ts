import { QueryDslTextQueryType } from '@elastic/elasticsearch/lib/api/types.js';

export const DENORMALIZED_WORKS_INDEX = 'denormalized_works_test_2024_08_01';
export const VALID_ENTITIES = [
  'authors',
  'concepts',
  'institutions',
  'publishers',
  'sources',
  'topics',
  'works',
  DENORMALIZED_WORKS_INDEX,
];

/**
 * Ordered from most relevant to least relevant
 */
export const RELEVANT_FIELDS = {
  works: ['title', 'abstract', 'doi'],
  authors: ['display_name', 'orcid', 'last_known_institution'],
  denorm_authors: ['authors.author_name', 'authors.orcid', 'authors.last_known_institution'],
  works_single: [
    'title^3',
    'abstract',
    'doi',
    'authors.author_name',
    'authors.orcid',
    'authors.last_known_institution',
  ],
};
// abstract_inverted_index

type SortOrder = 'asc' | 'desc';
type SortField = { [field: string]: { order: SortOrder; missing?: string } };

const baseSort: SortField[] = [{ _score: { order: 'desc' } }];

const sortConfigs: { [entity: string]: { [sortType: string]: (order: SortOrder) => SortField[] } } = {
  works: {
    publication_year: (order) => [{ publication_year: { order, missing: '_last' } }],
    publication_date: (order) => [{ publication_date: { order, missing: '_last' } }],
    cited_by_count: (order) => [{ cited_by_count: { order, missing: '_last' } }],
    title: (order) => [{ 'title.keyword': { order, missing: '_last' } }],
    relevance: () => [],
  },
  authors: {
    display_name: (order) => [{ 'display_name.keyword': { order, missing: '_last' } }],
    works_count: (order) => [{ works_count: { order, missing: '_last' } }],
    cited_by_count: (order) => [{ cited_by_count: { order, missing: '_last' } }],
    updated_date: (order) => [{ updated_date: { order, missing: '_last' } }],
    relevance: () => [],
  },
  [DENORMALIZED_WORKS_INDEX]: {
    publication_year: (order) => [{ publication_year: { order, missing: '_last' } }],
    publication_date: (order) => [{ publication_date: { order, missing: '_last' } }],
    cited_by_count: (order) => [{ cited_by_count: { order, missing: '_last' } }],
    title: (order) => [{ 'title.keyword': { order, missing: '_last' } }],
    author_name: (order) => [{ 'authors.author_name.keyword': { order, missing: '_last' } }],
    relevance: () => [],
  },
};

export function buildSimpleStringQuery(query: string, entity: string, fuzzy?: number) {
  return {
    simple_query_string: {
      query: query,
      // [entity]: {
      //   query: query,
      // },
    },
  };
}

export function buildBoolQuery(queries: any[]) {
  return {
    query: {
      bool: {
        // must: [],
        should: queries,
        // filter: [],
      },
    },
  };
}

export function buildMultiMatchQuery(query: string, entity: string, fuzzy?: number) {
  let fields = [];
  if (entity === 'works') fields = RELEVANT_FIELDS.works;
  if (entity === 'authors') fields = RELEVANT_FIELDS.denorm_authors;
  if (entity === 'works_single') fields = RELEVANT_FIELDS.works_single;

  const type: QueryDslTextQueryType = 'best_fields';
  return {
    multi_match: {
      query: query,
      fields: fields,
      type,
      fuzziness: fuzzy || 'AUTO',
    },
  };
}

export function buildSortQuery(entity: string, sortType?: string, sortOrder: SortOrder = 'desc'): SortField[] {
  const entityConfig = sortConfigs[entity];
  if (!entityConfig) {
    return baseSort;
  }

  const sortFunction = entityConfig[sortType] || entityConfig['relevance'] || (() => []);
  const specificSort = sortFunction(sortOrder);

  // return [...baseSort];
  return [...specificSort, ...baseSort];
}

export type IndexedAuthor = {
  _index: string;
  _id: string;
  _score: number;
  _source: {
    works_count: number;
    display_name: string;
    cited_by_count: number;
    works_api_url: string;
    orcid: string | null;
    id: string;
    last_known_institution: any | null;
    '@timestamp': string;
    '@version': string;
    updated_date: string;
  };
};
