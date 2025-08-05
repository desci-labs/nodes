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

  export interface QueryDslFunctionBoostMode {
    // Add minimal type definition
  }

  export interface QueryDslFunctionScoreContainer {
    // Add minimal type definition
  }

  export interface QueryDslFunctionScoreMode {
    // Add minimal type definition
  }

  export interface QueryDslFunctionScoreQuery {
    // Add minimal type definition
  }

  export interface QueryDslQueryContainer {
    // Add minimal type definition
  }

  export interface QueryDslTermQuery {
    // Add minimal type definition
  }

  export interface QueryDslTermsQuery {
    // Add minimal type definition
  }

  export interface QueryDslTextQueryType {
    // Add minimal type definition
  }
}

declare module '@elastic/elasticsearch/lib/api/typesWithBodyKey' {
  export * from '@elastic/elasticsearch/lib/api/types';
}
