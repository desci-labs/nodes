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
  works: ['title', 'abstract'],
  authors: ['display_name', 'orcid', 'last_known_institution'],
  topics: ['display_name'],
  fields: ['subfield_display_name'],
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

const NESTED_WORKS_ENTITIES = ['authors', 'best_locations', 'concepts', 'locations', 'topics', 'sources'];

type SortOrder = 'asc' | 'desc';
type SortField = { [field: string]: { order: SortOrder; missing?: string | number; type?: string; script?: any } };

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
  const currentYear = new Date().getFullYear();

  const functions: QueryDslFunctionScoreContainer[] = [
    // Citation count
    {
      filter: { range: { cited_by_count: { gte: 1 } } },
      field_value_factor: {
        field: 'cited_by_count',
        factor: 0.01,
        modifier: 'log1p',
      },
      weight: 5,
    },
    // Publication year
    {
      linear: {
        publication_year: {
          origin: currentYear.toString(),
          scale: '25',
          offset: '3',
          decay: 0.7,
        },
      },
      weight: 3,
    },
  ];

  if (entity === 'works' || entity === 'works_single') {
    // Boost for articles and preprints
    functions.push({
      weight: 1,
      filter: {
        bool: {
          should: [{ term: { type: 'article' } }, { term: { type: 'preprint' } }] as QueryDslQueryContainer[],
        } as QueryDslBoolQuery,
      },
    });

    // Boost for English language documents
    functions.push({
      weight: 0.5,
      filter: {
        term: { language: 'en' },
      },
    });
  }

  return {
    query,
    functions,
    boost_mode: 'sum' as QueryDslFunctionBoostMode,
    score_mode: 'sum' as QueryDslFunctionScoreMode,
  };
}

export function createAutocompleteFunctionScoreQuery(query: string): QueryDslQueryContainer {
  const functions: QueryDslFunctionScoreContainer[] = [
    // Citation count
    {
      filter: { range: { cited_by_count: { gte: 1 } } },
      field_value_factor: {
        field: 'cited_by_count',
        factor: 0.01,
        modifier: 'log1p',
      },
      weight: 10,
    },
    // Works count
    {
      filter: { range: { works_count: { gte: 1 } } },
      field_value_factor: {
        field: 'works_count',
        factor: 0.005,
        modifier: 'log1p',
      },
      weight: 5,
    },
  ];

  const shouldClauses: QueryDslQueryContainer[] = [
    // Exact match on keyword fields
    {
      multi_match: {
        query: query,
        fields: [
          'title.keyword^10',
          'primary_id.keyword^10',
          'entity_type.keyword^5',
          'publisher.keyword^5',
          'issn.keyword^5',
          'id.keyword^5',
        ],
        type: 'best_fields',
      },
    },
    // match on text fields
    {
      multi_match: {
        query: query,
        fields: [
          'title^3',
          'description^2',
          'publisher^2',
          'subfield_display_name^2',
          'institution_data.display_name^2',
        ],
      },
    },
  ];

  const boolQuery: QueryDslBoolQuery = {
    should: shouldClauses,
    minimum_should_match: 1,
  };

  const functionScoreQuery: QueryDslFunctionScoreQuery = {
    query: { bool: boolQuery },
    functions,
    boost_mode: 'multiply' as QueryDslFunctionBoostMode,
    score_mode: 'sum' as QueryDslFunctionScoreMode,
  };

  return { function_score: functionScoreQuery };
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
      const termFieldParts = filter.field.split('.');
      const isNested = NESTED_WORKS_ENTITIES.includes(termFieldParts[0]);
      const queryType = Array.isArray(filter.value) ? 'terms' : 'term';
      let valFormatted = filter.value;
      if (Array.isArray(valFormatted)) {
        valFormatted = valFormatted.map((v) => (typeof v === 'string' ? v.toLowerCase() : v));
      } else if (typeof valFormatted === 'string') {
        valFormatted = valFormatted.toLowerCase();
      }

      const query = { [queryType]: { [filter.field]: valFormatted } };

      if (isNested) {
        return {
          nested: {
            path: termFieldParts[0],
            query: query,
          },
        };
      }
      return query;
    case 'match_phrase':
      const fieldParts = filter.field.split('.');
      const isNestedMatchPhrase = NESTED_WORKS_ENTITIES.includes(fieldParts[0]);

      if (Array.isArray(filter.value)) {
        const queries = filter.value.map((value) => {
          if (isNestedMatchPhrase) {
            return {
              nested: {
                path: fieldParts[0],
                query: {
                  match_phrase: { [filter.field]: { query: value, analyzer: 'edge_ngram_analyzer' } },
                },
              },
            };
          } else {
            return { match_phrase: { [filter.field]: { query: value, analyzer: 'edge_ngram_analyzer' } } };
          }
        });

        return {
          bool: {
            [filter.matchLogic === 'and' ? 'must' : 'should']: queries,
            ...(filter.matchLogic === 'or' ? { minimum_should_match: 1 } : {}),
          },
        };
      }

      if (isNestedMatchPhrase) {
        return {
          nested: {
            path: fieldParts[0],
            query: {
              match_phrase: { [filter.field]: { query: filter.value, analyzer: 'edge_ngram_analyzer' } },
            },
          },
        };
      }

      return { match_phrase: { [filter.field]: { query: filter.value, analyzer: 'edge_ngram_analyzer' } } };
    case 'match':
      let matchQuery;
      if (Array.isArray(filter.value)) {
        matchQuery = {
          bool: {
            should: filter.value.map((value) => ({
              match: {
                [filter.field]: {
                  query: value,
                  operator: filter.matchLogic || 'or',
                },
              },
            })),
            minimum_should_match: 1,
          },
        };
      } else {
        matchQuery = {
          match: {
            [filter.field]: {
              query: filter.value,
              operator: filter.matchLogic || 'or',
            },
          },
        };
      }

      if (filter.field.includes('.') && !filter.field.includes('institutions')) {
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
  if (entity === 'concepts') return RELEVANT_FIELDS.concepts;
  if (entity === 'fields') return RELEVANT_FIELDS.fields;
  if (entity === 'institutions') return RELEVANT_FIELDS.institutions;
  if (entity === 'sources') return RELEVANT_FIELDS.sources;
  if (entity === 'autocomplete_full') return RELEVANT_FIELDS.autocomplete_full;
  if (entity === 'works_authors') return RELEVANT_FIELDS.denorm_authors;
  if (entity === 'works_fields') return RELEVANT_FIELDS.denorm_fields;
  if (entity === 'works_concepts') return RELEVANT_FIELDS.denorm_concepts;
  if (entity === 'works_topics') return RELEVANT_FIELDS.denorm_topics;
  if (entity === 'works_countries') return RELEVANT_FIELDS.denorm_countries;
  if (entity === 'works_institutions') return RELEVANT_FIELDS.denorm_institutions;
  if (entity === 'works_sources') return RELEVANT_FIELDS.denorm_sources;
  if (entity === 'works_single') return RELEVANT_FIELDS.works_single; // refers to the single query search

  return RELEVANT_FIELDS.works_single;
}

export function buildMultiMatchQuery(
  query: string,
  entity: string,
  fuzzy: string | number = 0,
): QueryDslQueryContainer {
  if (entity === 'autocomplete_full') {
    return createAutocompleteFunctionScoreQuery(query);
  }

  const fields = getRelevantFields(entity);
  const terms = query.split(/\s+/);
  const termCount = terms.length;

  const exactMatchBoost = 1000;
  const phraseMatchBoost = 100;
  const termMatchBoost = 5;

  const shouldClauses: QueryDslQueryContainer[] = [];

  // Exact match on keyword fields
  shouldClauses.push({
    multi_match: {
      query: query,
      fields: fields.map((field) => `${field}.keyword^${exactMatchBoost}`),
      type: 'best_fields' as QueryDslTextQueryType,
      boost: exactMatchBoost,
    },
  });

  // Phrase match on text fields
  shouldClauses.push({
    multi_match: {
      query: query,
      fields: fields.map((field) => `${field}^${phraseMatchBoost}`),
      type: 'phrase' as QueryDslTextQueryType,
      slop: 1,
      boost: phraseMatchBoost,
    },
  });

  // Term match with minimum should match
  shouldClauses.push({
    bool: {
      should: fields.map((field) => ({
        match: {
          [field]: {
            query: query,
            operator: 'or',
            minimum_should_match: Math.min(3, Math.ceil(termCount * 0.7)),
            boost: termMatchBoost,
          },
        },
      })),
      minimum_should_match: 1,
    },
  });

  // Special handling for 'works' and 'works_single' entities
  if (entity === 'works' || entity === 'works_single') {
    shouldClauses.unshift({
      match_phrase: {
        title: {
          query: query,
          boost: exactMatchBoost * 2, // Double boost for title exact match
          slop: 0,
        },
      },
    });
  }

  const multiMatchQuery: QueryDslQueryContainer = {
    bool: {
      should: shouldClauses,
      minimum_should_match: 1,
    },
  };

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
