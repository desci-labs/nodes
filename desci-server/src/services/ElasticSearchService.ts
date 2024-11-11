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
    // Citation count as tiebreaker
    {
      filter: { range: { cited_by_count: { gte: 1 } } },
      field_value_factor: {
        field: 'cited_by_count',
        factor: 0.0001,
        modifier: 'log1p',
      },
      weight: 1,
    },
    // Publication year as tiebreaker
    {
      linear: {
        publication_year: {
          origin: currentYear.toString(),
          scale: '25',
          offset: '3',
          decay: 0.7,
        },
      },
      weight: 0.5,
    },
  ];

  if (entity === 'works' || entity === 'works_single' || entity === 'works_opt') {
    functions.push(
      // Boost for articles and preprints
      {
        filter: {
          bool: {
            should: [{ term: { type: 'article' } }, { term: { type: 'preprint' } }],
          },
        },
        weight: 1,
      },
      // Venue quality as tiebreaker
      {
        filter: {
          range: { 'best_locations.works_count': { gte: 1000 } },
        },
        field_value_factor: {
          field: 'best_locations.works_count',
          factor: 0.00001,
          modifier: 'log1p',
        },
        weight: 0.3,
      },
      // Language preference
      {
        filter: {
          term: { language: 'en' },
        },
        weight: 0.2,
      },
    );
  }

  return {
    query,
    functions,
    boost_mode: 'sum' as QueryDslFunctionBoostMode,
    score_mode: 'sum' as QueryDslFunctionScoreMode,
    min_score: 0.1,
  };
}

export function createAutocompleteFunctionScoreQuery(query: string): QueryDslQueryContainer {
  // Use these as tie breakers, small multipliers to slightly boost more relevant work
  const boostFunctions: QueryDslFunctionScoreContainer[] = [
    {
      filter: {
        term: { entity_type: 'work' },
      },
      weight: 0.9,
    },
    {
      filter: { range: { cited_by_count: { gte: 1 } } },
      field_value_factor: {
        field: 'cited_by_count',
        factor: 0.001,
        modifier: 'log1p',
      },
      weight: 1.1,
    },
    {
      filter: { range: { works_count: { gte: 1 } } },
      field_value_factor: {
        field: 'works_count',
        factor: 1,
        modifier: 'log1p',
      },
      weight: 1.05,
    },
  ];

  const shouldClauses: QueryDslQueryContainer[] = [
    // Exact keyword matches (highest priority)
    {
      bool: {
        should: [
          {
            term: {
              'title.keyword': {
                value: query.toLowerCase(),
                boost: 100,
              },
            },
          },
          {
            term: {
              'primary_id.keyword': {
                value: query.toLowerCase(),
                boost: 100,
              },
            },
          },
          {
            term: {
              'id.keyword': {
                value: query.toLowerCase(),
                boost: 100,
              },
            },
          },
        ],
        minimum_should_match: 1,
      },
    },
    // 80% threshold matches (high-medium priority)
    {
      bool: {
        should: [
          {
            match: {
              title: {
                query: query,
                minimum_should_match: '80%',
                boost: 75,
              },
            },
          },
          {
            match: {
              primary_id: {
                query: query,
                minimum_should_match: '80%',
                boost: 75,
              },
            },
          },
          {
            match: {
              'institution_data.display_name': {
                query: query,
                minimum_should_match: '80%',
                boost: 75,
              },
            },
          },
        ],
        minimum_should_match: 1,
      },
    },
    // Prefix matches (medium priority)
    {
      bool: {
        should: [
          {
            prefix: {
              'title.keyword': {
                value: query.toLowerCase(),
                boost: 50,
              },
            },
          },
          {
            prefix: {
              'primary_id.keyword': {
                value: query.toLowerCase(),
                boost: 50,
              },
            },
          },
          {
            prefix: {
              'id.keyword': {
                value: query.toLowerCase(),
                boost: 50,
              },
            },
          },
        ],
        minimum_should_match: 1,
      },
    },
    // Prefix matches
    {
      multi_match: {
        query: query,
        fields: ['title'],
        type: 'phrase_prefix',
        boost: 200,
      },
    },
  ];

  const boolQuery: QueryDslBoolQuery = {
    should: shouldClauses,
    minimum_should_match: 1,
  };

  const functionScoreQuery: QueryDslFunctionScoreQuery = {
    query: { bool: boolQuery },
    functions: boostFunctions,
    boost_mode: 'multiply' as QueryDslFunctionBoostMode,
    score_mode: 'sum' as QueryDslFunctionScoreMode,
    min_score: 0.1,
  };

  return { function_score: functionScoreQuery };
}

function createEnhancedWorksQueryV2(query: string): QueryDslQueryContainer {
  const currentYear = new Date().getFullYear();

  const cleanQuery = query.toLowerCase();

  const shouldClauses: QueryDslQueryContainer[] = [
    // Exact matches (highest priority)
    {
      bool: {
        should: [
          {
            match_phrase: {
              title: {
                query: cleanQuery,
                boost: 30,
                analyzer: 'standard_analyzer',
              },
            },
          },
          {
            term: {
              doi: {
                value: cleanQuery,
                boost: 100,
              },
            },
          },
        ],
        minimum_should_match: 1,
      },
    },

    // High-precision matches (80% threshold)
    {
      bool: {
        should: [
          {
            match: {
              title: {
                query: cleanQuery,
                minimum_should_match: '70%',
                boost: 20,
                analyzer: 'standard_analyzer',
              },
            },
          },
          {
            match: {
              abstract: {
                query: cleanQuery,
                minimum_should_match: '80%',
                boost: 10,
                analyzer: 'standard_analyzer',
              },
            },
          },
        ],
        minimum_should_match: 1,
      },
    },
  ];

  const functionScoreQuery: QueryDslFunctionScoreQuery = {
    query: { bool: { should: shouldClauses, minimum_should_match: 1 } },
    functions: [
      // Citation impact as tiebreaker
      {
        filter: { range: { cited_by_count: { gte: 1 } } },
        field_value_factor: {
          field: 'cited_by_count',
          factor: 1,
          modifier: 'log1p',
        },
        weight: 25,
      },
      // Publication year as tiebreaker
      {
        linear: {
          publication_year: {
            origin: currentYear.toString(),
            scale: '25',
            offset: '3',
            decay: 0.5,
          },
        },
        weight: 5,
      },
      // // Boost for articles and preprints
      {
        filter: {
          bool: {
            should: [{ term: { type: 'article' } }, { term: { type: 'preprint' } }],
          },
        },
        weight: 1,
      },
      // // Venue quality as tiebreaker
      {
        filter: {
          range: { 'best_locations.works_count': { gte: 1000 } },
        },
        field_value_factor: {
          field: 'best_locations.works_count',
          factor: 1,
          modifier: 'log1p',
        },
        weight: 25,
      },
      // Language preference
      {
        filter: {
          term: { language: 'en' },
        },
        weight: 2,
      },
    ],
    score_mode: 'sum' as QueryDslFunctionScoreMode,
    boost_mode: 'sum' as QueryDslFunctionBoostMode,
    min_score: 0.1,
  };

  return { function_score: functionScoreQuery };
}

function createEnhancedWorksQuery(query: string): QueryDslQueryContainer {
  const currentYear = new Date().getFullYear();

  const cleanQuery = query.toLowerCase();

  const shouldClauses: QueryDslQueryContainer[] = [
    // Exact matches (highest priority)
    {
      bool: {
        should: [
          {
            match_phrase: {
              title: {
                query: cleanQuery,
                boost: 100,
                analyzer: 'standard_analyzer',
              },
            },
          },
          {
            term: {
              doi: {
                value: cleanQuery,
                boost: 90,
              },
            },
          },
        ],
        minimum_should_match: 1,
      },
    },

    // High-precision matches (80% threshold)
    {
      bool: {
        should: [
          {
            match: {
              title: {
                query: cleanQuery,
                minimum_should_match: '80%',
                boost: 75,
                analyzer: 'standard_analyzer',
              },
            },
          },
          {
            match: {
              abstract: {
                query: cleanQuery,
                minimum_should_match: '80%',
                boost: 40,
                analyzer: 'standard_analyzer',
              },
            },
          },
        ],
        minimum_should_match: 1,
      },
    },

    // Broader text matches
    {
      multi_match: {
        query: cleanQuery,
        fields: [
          'title^3',
          'abstract^2',
          'topics.display_name^2',
          'authors.display_name^1.5',
          'best_locations.display_name^1.5',
          'institutions.display_name^1.5',
        ],
        type: 'best_fields',
        operator: 'or',
        boost: 10,
        analyzer: 'standard_analyzer',
      },
    },

    // Fallback text matches with lower threshold
    {
      multi_match: {
        query: cleanQuery,
        fields: [
          'title^2',
          'abstract^1.5',
          'topics.display_name^1.5',
          'authors.display_name',
          'best_locations.display_name',
          'institutions.display_name',
        ],
        type: 'cross_fields',
        minimum_should_match: '50%',
        boost: 5,
        analyzer: 'standard_analyzer',
      },
    },
  ];

  const functionScoreQuery: QueryDslFunctionScoreQuery = {
    query: { bool: { should: shouldClauses, minimum_should_match: 1 } },
    functions: [
      // Citation impact as tiebreaker
      {
        filter: { range: { cited_by_count: { gte: 1 } } },
        field_value_factor: {
          field: 'cited_by_count',
          factor: 0.0001,
          modifier: 'log1p',
        },
        weight: 1,
      },
      // Publication year as tiebreaker
      {
        linear: {
          publication_year: {
            origin: currentYear.toString(),
            scale: '25',
            offset: '3',
            decay: 0.7,
          },
        },
        weight: 0.5,
      },
      // Boost for articles and preprints
      {
        filter: {
          bool: {
            should: [{ term: { type: 'article' } }, { term: { type: 'preprint' } }],
          },
        },
        weight: 1,
      },
      // Venue quality as tiebreaker
      {
        filter: {
          range: { 'best_locations.works_count': { gte: 1000 } },
        },
        field_value_factor: {
          field: 'best_locations.works_count',
          factor: 0.00001,
          modifier: 'log1p',
        },
        weight: 0.3,
      },
      // Language preference
      {
        filter: {
          term: { language: 'en' },
        },
        weight: 0.2,
      },
    ],
    score_mode: 'sum' as QueryDslFunctionScoreMode,
    boost_mode: 'sum' as QueryDslFunctionBoostMode,
    min_score: 0.1,
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

  if (entity === 'works' || entity === 'works_single' || entity === 'works_opt') {
    return createEnhancedWorksQueryV2(query);
    // return createEnhancedWorksQuery(query);
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
