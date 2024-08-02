import { SearchTotalHits } from '@elastic/elasticsearch/lib/api/types.js';
import { Request, Response } from 'express';

import { elasticClient } from '../../elasticSearchClient.js';
import { logger as parentLogger } from '../../logger.js';
import {
  buildBoolQuery,
  buildMultiMatchQuery,
  buildSimpleStringQuery,
  buildSortQuery,
  DENORMALIZED_WORKS_INDEX,
  VALID_ENTITIES,
} from '../../services/ElasticSearchService.js';

export interface SingleQuerySuccessResponse extends QueryDebuggingResponse {
  ok: true;
  page: number;
  perPage: number;
  total: number | SearchTotalHits;
  data: any[];
}

export interface QueryDebuggingResponse {
  esQuery?: any;
  esQueries?: any;
  esSort?: any;
}

export interface SingleQueryErrorResponse extends QueryDebuggingResponse {
  ok: false;
  error: string;
}

interface QuerySearchBodyParams {
  query: string;
  entity: string;
  fuzzy?: number;
  sortType?: string;
  sortOrder?: 'asc' | 'desc';
  page?: number;
  perPage?: number;
}

export const singleQuery = async (
  req: Request<any, any, QuerySearchBodyParams>,
  res: Response<SingleQuerySuccessResponse | SingleQueryErrorResponse>,
) => {
  const { query, fuzzy, sortType = 'relevance', sortOrder, page = 1, perPage = 10 }: QuerySearchBodyParams = req.body;

  let { entity } = req.body;

  const logger = parentLogger.child({
    module: 'SEARCH::Query',
    query,
    entity,
    fuzzy,
    sortType,
    sortOrder,
    page,
    perPage,
  });
  if (entity === 'works') {
    logger.info({ entity }, `Entity is 'works', changing to denormalized works index: ${DENORMALIZED_WORKS_INDEX}`);
    entity = DENORMALIZED_WORKS_INDEX;
  }
  //
  logger.trace({ fn: 'Executing elastic search query' });

  if (!VALID_ENTITIES.includes(entity)) {
    return res.status(400).json({
      ok: false,
      error: `Invalid entity: ${entity}, the following entities are supported: ${VALID_ENTITIES.join(' ')}`,
    });
  }

  // const esQuery = buildSimpleStringQuery(query, entity, fuzzy);
  const esQuery = buildMultiMatchQuery(query, 'works_single', fuzzy);
  const esSort = buildSortQuery(entity, sortType, sortOrder);

  try {
    logger.debug({ esQuery, esSort }, 'Executing query');
    const results = await elasticClient.search({
      index: entity,
      body: {
        query: esQuery,
        sort: esSort,
        from: (page - 1) * perPage,
        size: perPage,
      },
    });
    const hits = results.hits;
    logger.info({ fn: 'Elastic search query executed successfully' });

    return res.json({
      esQuery,
      esSort,
      ok: true,
      total: hits.total,
      page,
      perPage,
      data: hits.hits,
    });
  } catch (error) {
    logger.error({ error }, 'Elastic search query failed');
    return res.status(500).json({
      ok: false,
      error: 'An error occurred while searching',
      esQuery,
      esSort,
    });
  }
};
