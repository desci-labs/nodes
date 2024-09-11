import { Request, Response } from 'express';

import { elasticClient } from '../../elasticSearchClient.js';
import { logger as parentLogger } from '../../logger.js';
import {
  buildBoolQuery,
  buildMultiMatchQuery,
  buildSortQuery,
  VALID_ENTITIES,
} from '../../services/ElasticSearchService.js';

import { Entity, Filter, Query, QueryDebuggingResponse, QueryErrorResponse, QuerySuccessResponse } from './types.js';

type QueryObject = Record<Entity, Query>;

interface MultiQuerySearchParams {
  queries: QueryObject[];
  filters?: Filter[];
  fuzzy?: number;
  sort?: {
    field: string;
    order: 'asc' | 'desc';
  };
  pagination?: {
    page: number;
    perPage: number;
  };
}

export const multiQuery = async (
  req: Request<any, any, MultiQuerySearchParams>,
  res: Response<(QuerySuccessResponse & QueryDebuggingResponse) | QueryErrorResponse>,
) => {
  const {
    queries,
    fuzzy,
    filters,
    sort = { field: '_score', order: 'desc' },
    pagination = { page: 1, perPage: 10 },
  }: MultiQuerySearchParams = req.body;
  const logger = parentLogger.child({
    module: 'SEARCH::MultiQuery',
    queries,
    filters,
    fuzzy,
    sort,
    pagination,
  });

  logger.trace({ fn: 'Executing elastic search query' });

  const validEntityQueries = queries.filter((q) => VALID_ENTITIES.includes(Object.keys(q)[0]));
  if (!validEntityQueries) {
    return res.status(400).json({
      ok: false,
      error: `Invalid queries, the following entities are supported: ${VALID_ENTITIES.join(' ')}`,
    });
  }

  const primaryEntity = 'works'; // Hard coded for now to not affect results without a 'works' query.
  // const primaryEntity = Object.keys(validEntityQueries[0])[0];

  const esQueries = validEntityQueries.map((q) => {
    const [entity, query] = Object.entries(q)[0];
    let fullEntity = entity;
    if (entity !== primaryEntity) fullEntity = `${primaryEntity}_${entity}`; // e.g. if we're searching for authors in the works table, entity should be 'works_authors'
    return buildMultiMatchQuery(query, fullEntity, fuzzy);
  });

  const esSort = buildSortQuery(primaryEntity, sort.field, sort.order);
  const esBoolQuery = buildBoolQuery(esQueries, filters);

  try {
    logger.debug({ esQueries, esSort, esBoolQuery }, 'Executing query');
    const { hits } = await elasticClient.search({
      index: primaryEntity,
      body: {
        ...esBoolQuery,
        sort: esSort,
        from: (pagination.page - 1) * pagination.perPage,
        size: pagination.perPage,
      },
    });

    logger.info({ fn: 'Elastic search multi query executed successfully' });
    return res.json({
      esQueries,
      esBoolQuery,
      esSort,
      index: primaryEntity,
      ok: true,
      total: hits.total,
      page: pagination.page,
      perPage: pagination.perPage,
      data: hits.hits,
    });
  } catch (error) {
    logger.error({ error }, 'Elastic search multi query failed');
    return res.status(500).json({
      esQueries,
      esBoolQuery,
      esSort,
      ok: false,
      error: 'An error occurred while searching',
    });
  }
};
