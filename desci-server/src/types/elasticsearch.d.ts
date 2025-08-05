declare module '@elastic/elasticsearch/lib/api/types' {
  export interface SearchTotalHits {
    value: number;
    relation: 'eq' | 'gte';
  }

  export interface QueryDslBoolQuery {
    must?: any[];
    should?: any[];
    filter?: any[];
    must_not?: any[];
    minimum_should_match?: number | string;
  }

  // TODO: Expand this interface with additional boost modes as needed
  // Reference: https://www.elastic.co/guide/en/elasticsearch/reference/current/query-dsl-function-score-query.html
  export interface QueryDslFunctionBoostMode {
    readonly _brand?: 'QueryDslFunctionBoostMode'; // Prevents implicit any
  }

  // Common boost modes used in Elasticsearch function score queries
  export type FunctionBoostMode = 'multiply' | 'replace' | 'sum' | 'avg' | 'max' | 'min';

  // TODO: Implement complete function score container interface
  // Reference: https://www.elastic.co/guide/en/elasticsearch/reference/current/query-dsl-function-score-query.html
  export interface QueryDslFunctionScoreContainer {
    readonly _brand?: 'QueryDslFunctionScoreContainer'; // Prevents implicit any
    filter?: QueryDslQueryContainer;
    weight?: number;
    random_score?: {
      field?: string;
      seed?: number | string;
    };
    script_score?: {
      script: {
        source: string;
        params?: Record<string, any>;
      };
    };
  }

  // TODO: Expand with additional score modes as needed
  // Reference: https://www.elastic.co/guide/en/elasticsearch/reference/current/query-dsl-function-score-query.html
  export interface QueryDslFunctionScoreMode {
    readonly _brand?: 'QueryDslFunctionScoreMode'; // Prevents implicit any
  }

  // Common score modes used in Elasticsearch function score queries
  export type FunctionScoreMode = 'multiply' | 'sum' | 'avg' | 'first' | 'max' | 'min';

  // TODO: Implement complete function score query interface with all supported functions
  // Reference: https://www.elastic.co/guide/en/elasticsearch/reference/current/query-dsl-function-score-query.html
  export interface QueryDslFunctionScoreQuery {
    readonly _brand?: 'QueryDslFunctionScoreQuery'; // Prevents implicit any
    query?: QueryDslQueryContainer;
    boost?: number;
    functions?: QueryDslFunctionScoreContainer[];
    max_boost?: number;
    score_mode?: FunctionScoreMode;
    boost_mode?: FunctionBoostMode;
    min_score?: number;
  }

  // TODO: Implement complete query container interface with all query types
  // Reference: https://www.elastic.co/guide/en/elasticsearch/reference/current/query-dsl.html
  export interface QueryDslQueryContainer {
    readonly _brand?: 'QueryDslQueryContainer'; // Prevents implicit any
    bool?: QueryDslBoolQuery;
    term?: Record<string, QueryDslTermQuery>;
    terms?: Record<string, QueryDslTermsQuery>;
    match?: Record<
      string,
      {
        query: string;
        operator?: 'and' | 'or';
        analyzer?: string;
        boost?: number;
        fuzziness?: string | number;
      }
    >;
    match_all?: {
      boost?: number;
    };
    function_score?: QueryDslFunctionScoreQuery;
    range?: Record<
      string,
      {
        gte?: any;
        gt?: any;
        lte?: any;
        lt?: any;
        boost?: number;
      }
    >;
  }

  // TODO: Expand with additional term query options as needed
  // Reference: https://www.elastic.co/guide/en/elasticsearch/reference/current/query-dsl-term-query.html
  export interface QueryDslTermQuery {
    readonly _brand?: 'QueryDslTermQuery'; // Prevents implicit any
    value: any;
    boost?: number;
    case_insensitive?: boolean;
  }

  // TODO: Implement complete terms query interface with all options
  // Reference: https://www.elastic.co/guide/en/elasticsearch/reference/current/query-dsl-terms-query.html
  export interface QueryDslTermsQuery {
    readonly _brand?: 'QueryDslTermsQuery'; // Prevents implicit any
    value?: any[];
    boost?: number;
    index?: string;
    id?: string;
    path?: string;
    routing?: string;
  }

  // TODO: Expand with additional text query types as needed
  // Reference: https://www.elastic.co/guide/en/elasticsearch/reference/current/query-dsl-match-query.html
  export interface QueryDslTextQueryType {
    readonly _brand?: 'QueryDslTextQueryType'; // Prevents implicit any
  }

  // Common text query types used in Elasticsearch
  export type TextQueryType =
    | 'best_fields'
    | 'most_fields'
    | 'cross_fields'
    | 'phrase'
    | 'phrase_prefix'
    | 'bool_prefix';
}

declare module '@elastic/elasticsearch/lib/api/typesWithBodyKey' {
  export * from '@elastic/elasticsearch/lib/api/types';
}
