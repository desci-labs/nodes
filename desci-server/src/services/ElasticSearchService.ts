import {
  QueryDslBoolQuery,
  QueryDslFunctionBoostMode,
  QueryDslFunctionScoreContainer,
  QueryDslFunctionScoreMode,
  QueryDslFunctionScoreQuery,
  QueryDslQueryContainer,
  QueryDslTermQuery,
  QueryDslTermsQuery,
  QueryDslTextQueryType,
} from '@elastic/elasticsearch/lib/api/types.js';

import { Filter } from '../controllers/search/types.js';

export const VALID_ENTITIES = [
  'authors',
  'concepts',
  'institutions',
  // 'publishers',
  'sources',
  'topics',
  'fields',
  'works',
  'countries',
  'autocomplete_full',
];

/**
 * Ordered from most relevant to least relevant
 */
export const RELEVANT_FIELDS = {
  works: ['title', 'abstract', 'doi'],
  authors: ['display_name', 'orcid', 'last_known_institution', 'authors.affiliation'],
  topics: ['display_name'],
  fields: ['field_display_name'],
  concepts: ['display_name'],
  sources: ['display_name', 'publisher', 'issn_l', 'issn'],
  autocomplete_full: ['title', 'publisher', 'primary_id'],
  institutions: ['display_name', 'homepage_url', 'ror', 'country_code'],
  denorm_authors: ['authors.display_name', 'authors.orcid', 'authors.last_known_institution', 'authors.affiliation'],
  denorm_topics: ['topics.display_name'],
  denorm_fields: ['topics.subfield_display_name'],
  denorm_concepts: ['concepts.display_name', 'concepts.subfield_display_name'],
  denorm_sources: ['best_locations.display_name', 'best_locations.publisher'],
  denorm_institutions: ['institutions.display_name', 'institutions.ror', 'institutions.country_code'],
  denorm_countries: ['institutions.country_code'],
  works_single: [
    'title^1.25',
    'abstract^1.25',
    'topics.display_name^1.25',
    'topics.subfield_display_name^1.25',
    'doi',
    'authors.display_name',
    'authors.orcid',
    'authors.last_known_institution',
    'authors.last_known_institution',
    'authors.affiliation',
    'institutions.display_name',
    'best_locations.publisher',
    'best_locations.display_name',
  ],
};

type SortOrder = 'asc' | 'desc';
type SortField = { [field: string]: { order: SortOrder; missing?: string } };

const baseSort: SortField[] = [{ _score: { order: 'desc' } }];

const sortConfigs: { [entity: string]: { [sortType: string]: (order: SortOrder) => SortField[] } } = {
  authors: {
    display_name: (order) => [{ 'display_name.keyword': { order, missing: '_last' } }],
    works_count: (order) => [{ works_count: { order, missing: '_last' } }],
    cited_by_count: (order) => [{ cited_by_count: { order, missing: '_last' } }],
    updated_date: (order) => [{ updated_date: { order, missing: '_last' } }],
    relevance: () => [],
  },
  works: {
    // ex denormalized works, probably safe to remove old 'works' config above
    context_novelty_percentile: (order) => [{ context_novelty_percentile: { order, missing: '_last' } }],
    content_novelty_percentile: (order) => [{ content_novelty_percentile: { order, missing: '_last' } }],
    publication_year: (order) => [{ publication_year: { order, missing: '_last' } }],
    publication_date: (order) => [{ publication_date: { order, missing: '_last' } }],
    cited_by_count: (order) => [{ cited_by_count: { order, missing: '_last' } }],
    title: (order) => [{ 'title.keyword': { order, missing: '_last' } }],
    author_name: (order) => [{ 'authors.author_name.keyword': { order, missing: '_last' } }],
    relevance: () => [],
  },
};

export function createFunctionScoreQuery(query: QueryDslQueryContainer, entity: string): QueryDslFunctionScoreQuery {
  /**
   * Boost work citations, author citations, and reduce non articles
   */
  const currentYear = new Date().getFullYear();

  const functions: QueryDslFunctionScoreContainer[] = [
    {
      field_value_factor: {
        field: 'cited_by_count',
        factor: 1.5,
        modifier: 'log1p',
        missing: 0,
      },
    },
    {
      field_value_factor: {
        field: 'authors.cited_by_count',
        factor: 1.1,
        modifier: 'log1p',
        missing: 1,
      },
    },
    // {
    //   gauss: {
    //     publication_year: {
    //       origin: currentYear.toString(),
    //       scale: '100', // 100 years
    //       offset: '5', // 5 years (grace period)
    //       decay: 0.5,
    //     },
    //   },
    // },
    {
      linear: {
        publication_year: {
          origin: currentYear.toString(),
          scale: '25', // 25 years
          offset: '3', // 3 years (grace period)
          decay: 0.7,
        },
      },
    },
  ];

  if (entity === 'works' || 'works_single') {
    const nonArticleFilter: QueryDslQueryContainer = {
      bool: {
        must_not: [
          {
            term: {
              type: 'article',
            } as QueryDslTermsQuery,
          },
        ],
      } as QueryDslBoolQuery,
    };

    const nonEnglishFilter: QueryDslQueryContainer = {
      bool: {
        must_not: [
          {
            term: {
              language: 'en',
            } as QueryDslTermsQuery,
          },
        ],
      } as QueryDslBoolQuery,
    };

    functions.push({
      weight: 0.5,
      filter: nonArticleFilter,
    });
    functions.push({
      weight: 0.1,
      filter: nonEnglishFilter,
    });
  }

  return {
    query,
    functions,
    boost_mode: 'multiply' as QueryDslFunctionBoostMode,
    score_mode: 'multiply' as QueryDslFunctionScoreMode,
  };
}

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

export function buildBoolQuery(queries: any[], filters: Filter[] = []) {
  const boolQuery: any = {
    bool: {
      should: queries,
    },
  };

  if (filters.length > 0) {
    boolQuery.bool.filter = filters.map(buildFilter);
  }

  return { query: boolQuery };
}

function buildFilter(filter: Filter) {
  switch (filter.type) {
    case 'range':
      return {
        range: {
          [filter.field]: {
            [filter.operator]: filter.value,
          },
        },
      };
    case 'term':
      return {
        term: {
          [filter.field]: filter.value,
        },
      };
    case 'match_phrase':
      const authorQuery = Array.isArray(filter.value)
        ? {
            bool: {
              [filter.matchLogic === 'and' ? 'must' : 'should']: filter.value.map((value) => ({
                match_phrase: { [filter.field]: value },
              })),
              ...(filter.matchLogic === 'or' ? { minimum_should_match: 1 } : {}),
            },
          }
        : { match_phrase: { [filter.field]: filter.value } };

      const fieldParts = filter.field.split('.');
      if (fieldParts.length > 1) {
        return {
          nested: {
            path: fieldParts[0],
            query: {
              bool: {
                must: [authorQuery],
              },
            },
          },
        };
      }
      return {
        bool: {
          must: [authorQuery],
        },
      };
    case 'match':
      const matchQuery = {
        match: {
          [filter.field]: {
            query: filter.value,
            operator: filter.matchLogic || 'or',
            ...(filter.fuzziness && { fuzziness: filter.fuzziness }),
          },
        },
      };

      if (filter.field.includes('.')) {
        const [nestedPath, nestedField] = filter.field.split('.');
        return {
          nested: {
            path: nestedPath,
            query: matchQuery,
          },
        };
      }
      return matchQuery;
    case 'exists':
      return {
        exists: {
          field: filter.field,
        },
      };
  }
}

function getRelevantFields(entity: string) {
  if (entity === 'works') return RELEVANT_FIELDS.works;
  if (entity === 'authors') return RELEVANT_FIELDS.authors;
  if (entity === 'topics') return RELEVANT_FIELDS.topics;
  if (entity === 'fields') return RELEVANT_FIELDS.fields;
  if (entity === 'institutions') return RELEVANT_FIELDS.institutions;
  if (entity === 'sources') return RELEVANT_FIELDS.sources;
  if (entity === 'autocomplete_full') return RELEVANT_FIELDS.autocomplete_full;
  if (entity === 'works_authors') return RELEVANT_FIELDS.denorm_authors;
  if (entity === 'works_fields') return RELEVANT_FIELDS.denorm_fields;
  if (entity === 'works_topics') return RELEVANT_FIELDS.denorm_topics;
  if (entity === 'works_countries') return RELEVANT_FIELDS.denorm_countries;
  if (entity === 'works_institutions') return RELEVANT_FIELDS.denorm_institutions;
  if (entity === 'works_sources') return RELEVANT_FIELDS.denorm_sources;
  if (entity === 'works_single') return RELEVANT_FIELDS.works_single; // refers to the single query search

  return RELEVANT_FIELDS.works_single;
}

export function buildMultiMatchQuery(query: string, entity: string, fuzzy?: number): QueryDslQueryContainer {
  const fields = getRelevantFields(entity);

  let multiMatchQuery: QueryDslQueryContainer;

  if (entity.startsWith('works_')) {
    const nestedField = fields[0]?.split('.')[0];
    multiMatchQuery = {
      nested: {
        path: nestedField,
        query: {
          multi_match: {
            query: query,
            fields: fields,
            type: 'best_fields',
            fuzziness: fuzzy || 'AUTO',
          },
        },
      },
    };
  } else {
    multiMatchQuery = {
      multi_match: {
        query: query,
        fields: fields,
        type: 'best_fields',
        fuzziness: fuzzy || 'AUTO',
      },
    };
  }

  if (entity === 'works' || entity === 'works_single') {
    return {
      function_score: createFunctionScoreQuery(multiMatchQuery, entity),
    };
  }
  return multiMatchQuery;
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

export interface MultiMatchQuery {
  query: string;
  fields: any[];
  type: QueryDslTextQueryType;
  fuzziness: string | number;
}
