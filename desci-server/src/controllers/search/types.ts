import { SearchTotalHits } from '@elastic/elasticsearch/lib/api/types.js';

import { VALID_ENTITIES } from '../../services/ElasticSearchService.js';
export type Entity = string;
export type Query = string;

export type ComparisonOperator = 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte';
export type FilterType = 'range' | 'term' | 'match' | 'exists';

export type Filter = {
  entity: Entity;
  field: string;
  type: FilterType;
} & (
  | { type: 'range'; operator: ComparisonOperator; value: number | string }
  | { type: 'term'; value: string | number | boolean }
  | { type: 'match'; value: string }
  | { type: 'exists' }
);

export interface QuerySuccessResponse extends QueryDebuggingResponse {
  ok: true;
  index: (typeof VALID_ENTITIES)[number];
  page: number;
  perPage: number;
  total: number | SearchTotalHits;
  data: any[];
}

export interface QueryDebuggingResponse {
  esQuery?: any;
  esQueries?: any;
  esBoolQuery?: any;
  esSort?: any;
}

export interface QueryErrorResponse extends QueryDebuggingResponse {
  ok: false;
  error: string;
}
